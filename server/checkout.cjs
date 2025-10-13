// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// -------- ENV --------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://taedal-v3.vercel.app").replace(/\/$/, "");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// Stripe client
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Supabase admin (DB writes) + public (to verify Authorization token)
const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const sbPublic =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Helper to read current user from Authorization: Bearer <token>
async function getUserFromRequest(req) {
  try {
    if (!sbPublic) return null;
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const { data, error } = await sbPublic.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

const feUrl = (path = "") => `${FRONTEND_URL}/${String(path).replace(/^\//, "")}`;

// ---------- Health ----------
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stripeConfigured: !!stripe,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    frontend: FRONTEND_URL,
  });
});

/**
 * POST /api/checkout/create-stripe-session
 *
 * Accepts:
 * - { listing_id: "uuid" }  -> reads listing from DB
 * - { amount: number, currency: "usd", name?: string }  -> direct amount flow
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ error: "Stripe not configured" });

    const user = await getUserFromRequest(req); // who is paying
    const buyerId = user?.id || null;

    const {
      listing_id,
      amount,
      currency = "usd",
      name = "Artwork",
    } = req.body || {};

    let unitAmountCents;
    let usedCurrency = String(currency).toLowerCase();
    let productName = String(name || "Artwork");
    const metadata = {};

    // Path A: checkout from server-authoritative listing
    if (listing_id) {
      if (!sbAdmin) return res.status(500).json({ error: "Supabase admin not configured" });

      const { data: listing, error } = await sbAdmin
        .from("listings")
        .select("id, artwork_id, price, price_eth, currency, status")
        .eq("id", listing_id)
        .single();

      if (error || !listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active") return res.status(400).json({ error: "Listing not active" });

      const ccy = String(listing.currency || "").toLowerCase();
      if (ccy !== "usd") return res.status(400).json({ error: "Card checkout allowed only for USD listings" });

      const dollars = Number(listing.price ?? listing.price_eth);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return res.status(400).json({ error: "Invalid listing price" });
      }

      unitAmountCents = Math.round(dollars * 100);
      usedCurrency = "usd";

      metadata.listing_id = listing.id;
      metadata.artwork_id = listing.artwork_id || "";
      if (buyerId) metadata.buyer_id = buyerId;
    } else {
      // Path B: direct amount (no listing)
      if (usedCurrency !== "usd") {
        return res.status(400).json({ error: "Card checkout allowed only for USD currency" });
      }
      const dollars = Number(amount);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      unitAmountCents = Math.round(dollars * 100);
      if (buyerId) metadata.buyer_id = buyerId;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: usedCurrency,
            unit_amount: unitAmountCents,
            product_data: { name: productName },
          },
          quantity: 1,
        },
      ],
      success_url: feUrl("checkout/success?session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: feUrl("checkout/cancel"),
      metadata,
    });

    return res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("[stripe] create session error:", e);
    return res.status(500).json({
      error: "Failed to create session",
      details: e?.message || String(e),
    });
  }
});

// Optional crypto stub
router.post("/create-crypto-intent", async (_req, res) => {
  return res.status(501).json({ error: "Crypto checkout not configured" });
});

// ---------- Webhook ----------
async function webhook(req, res) {
  if (!STRIPE_WEBHOOK_SECRET) return res.status(501).send("Webhook not configured");
  if (!stripe) return res.status(501).send("Stripe not configured");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe] webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const listingId = session.metadata?.listing_id || null;
      const artworkId = session.metadata?.artwork_id || null;
      const buyerId = session.metadata?.buyer_id || null;

      const amountTotal = Number(session.amount_total || 0);
      const currency = String(session.currency || "usd").toUpperCase();
      const paidDisplay = `${currency} ${(amountTotal / 100).toFixed(2)}`;

      if (listingId && sbAdmin) {
        // 1) mark listing filled
        const { data: lst, error: e1 } = await sbAdmin
          .from("listings")
          .update({ status: "filled", updated_at: new Date().toISOString() })
          .eq("id", listingId)
          .select("*")
          .single();

        if (e1) {
          console.error("[webhook] listings update failed:", e1);
        } else {
          // 2) transfer ownership if we know buyer + artwork
          if (buyerId && artworkId) {
            const { error: e2 } = await sbAdmin
              .from("artworks")
              .update({ owner: buyerId, updated_at: new Date().toISOString() })
              .eq("id", artworkId);
            if (e2) console.error("[webhook] transfer ownership failed:", e2);
          }

          // 3) record activity
          await sbAdmin.from("activity").insert({
            artwork_id: artworkId || lst.artwork_id,
            kind: "buy",
            actor: buyerId || (session.customer || "stripe"),
            tx_hash: session.payment_intent || null,
            note: `Card checkout via Stripe: ${paidDisplay}`,
            price_eth: null,
          });
        }
      }
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("[stripe] webhook processing error:", e);
    return res.status(500).send("server error");
  }
}

// Lookup session details
router.get("/session", async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ error: "Stripe not configured" });
    const sid = String(req.query.session_id || req.query.sid || "").trim();
    if (!sid) return res.status(400).json({ error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(sid, {
      expand: ["payment_intent", "customer"],
    });
    return res.json({ ok: true, session });
  } catch (e) {
    console.error("[stripe] session retrieve error:", e);
    return res.status(404).json({ error: "Session not found" });
  }
});

module.exports = { router, webhook };
