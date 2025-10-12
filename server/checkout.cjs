// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// -------- ENV --------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Your deployed frontend URL (used for success/cancel redirects)
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://taedal-v3.vercel.app").replace(/\/$/, "");

// Supabase (admin) to read listings and mark them filled from webhook
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Stripe + Supabase clients
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Helper to build absolute URLs to your frontend
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
 * Two accepted payloads:
 * 1) Existing listing:
 *    { "listing_id": "uuid" }
 *
 * 2) Direct amount (no listing yet):
 *    {
 *      "amount": 12,          // dollars (NOT cents)
 *      "currency": "usd",     // must be "usd" for card
 *      "name": "Artwork title" (optional)
 *    }
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ error: "Stripe not configured" });

    const {
      listing_id,          // string (optional)
      amount,              // number in dollars (optional when listing_id is sent)
      currency = "usd",    // string
      name = "Artwork",    // product name
    } = req.body || {};

    let unitAmountCents;
    let usedCurrency = String(currency).toLowerCase();
    let productName = String(name || "Artwork");
    let metadata = {};

    // ---- Path A: Use a server-authoritative listing ----
    if (listing_id) {
      if (!sbAdmin) return res.status(500).json({ error: "Supabase admin not configured" });

      const { data: listing, error } = await sbAdmin
        .from("listings")
        .select("id, artwork_id, price, price_eth, currency, status")
        .eq("id", listing_id)
        .single();

      if (error || !listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active") return res.status(400).json({ error: "Listing not active" });

      // We only allow Stripe card checkout for USD
      const ccy = String(listing.currency || "").toLowerCase();
      if (ccy !== "usd") {
        return res.status(400).json({ error: "Card checkout allowed only for USD listings" });
      }

      // price (USD dollars) → cents
      const dollars = Number(listing.price ?? listing.price_eth);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return res.status(400).json({ error: "Invalid listing price" });
      }
      unitAmountCents = Math.round(dollars * 100);
      usedCurrency = "usd";
      metadata = { listing_id: listing.id, artwork_id: listing.artwork_id || "" };
    }
    // ---- Path B: Direct amount (no listing yet) ----
    else {
      if (usedCurrency !== "usd") {
        return res.status(400).json({ error: "Card checkout allowed only for USD currency" });
      }
      const dollars = Number(amount);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      unitAmountCents = Math.round(dollars * 100); // dollars → cents
      metadata = {}; // no listing_id
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: usedCurrency,          // "usd"
            unit_amount: unitAmountCents,    // integer cents
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

/**
 * (Optional) Crypto checkout stub.
 * Implement with your provider (e.g., Coinbase Commerce) or keep as 501.
 */
router.post("/create-crypto-intent", async (_req, res) => {
  return res.status(501).json({ error: "Crypto checkout not configured" });
});

// ---------- Webhook (exported for index.cjs to mount with express.raw) ----------
async function webhook(req, res) {
  if (!STRIPE_WEBHOOK_SECRET) {
    // If not configured, respond 501 so Stripe will retry later.
    return res.status(501).send("Webhook not configured");
  }
  if (!stripe) return res.status(501).send("Stripe not configured");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // req.body is raw Buffer because index.cjs mounts this with express.raw({ type: "application/json" })
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe] webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const listingId = session.metadata?.listing_id;

        // If this purchase was tied to a listing, mark it filled
        if (listingId && sbAdmin) {
          const { data, error } = await sbAdmin
            .from("listings")
            .update({
              status: "filled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", listingId)
            .select("*")
            .single();

          if (error) {
            console.error("[webhook] supabase update failed:", error);
          } else {
            // Record activity row (optional)
            await sbAdmin.from("activity").insert({
              artwork_id: data.artwork_id,
              kind: "buy",
              actor: session.customer || "stripe",
              tx_hash: session.payment_intent || null,
              note: `Card checkout via Stripe: ${String(session.currency || "usd").toUpperCase()} ${(
                (session.amount_total || 0) / 100
              ).toFixed(2)}`,
            });
          }
        }
        break;
      }
      default:
        // handle other events if needed
        break;
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("[stripe] webhook processing error:", e);
    return res.status(500).send("server error");
  }
}

module.exports = { router, webhook };
