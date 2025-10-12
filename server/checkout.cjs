// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");

// --- Stripe config -----------------------------------------------------------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
if (!STRIPE_SECRET_KEY) {
  console.warn("[checkout] STRIPE_SECRET_KEY is not set – Stripe disabled.");
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// --- App url for redirects ---------------------------------------------------
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

// --- Supabase (admin + lightweight auth for user) ---------------------------
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

const sbPublic =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

/** Resolve Supabase user from Authorization: Bearer <jwt> header (if present). */
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

/** Idempotently fill a listing and write activity. Optionally transfer artwork owner. */
async function fillListing({ listingId, buyerId, txHash = null }) {
  if (!sbAdmin) throw new Error("Supabase admin client not configured");

  // Mark listing filled only if still active
  const { data: lst, error: updErr } = await sbAdmin
    .from("listings")
    .update({ status: "filled", updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("status", "active")
    .select("*")
    .single();

  // If it was already filled/cancelled, fetch to return a stable shape
  if (updErr) {
    // If the update failed because 0 rows matched (already filled), read it:
    const { data: existing } = await sbAdmin.from("listings").select("*").eq("id", listingId).maybeSingle();
    if (existing && existing.status !== "active") {
      return { alreadyFinalized: true, listing: existing };
    }
    throw updErr;
  }

  // Write activity
  await sbAdmin.from("activity").insert({
    artwork_id: lst.artwork_id,
    kind: "buy",
    actor: buyerId,
    tx_hash: txHash,
    note: `Bought for ${lst.price ?? lst.price_eth} ${lst.currency || "ETH"}`,
  });

  // Optional: transfer ownership to buyer (comment out if not desired)
  await sbAdmin.from("artworks").update({ owner: buyerId }).eq("id", lst.artwork_id);

  return { alreadyFinalized: false, listing: lst };
}

// ---------------------------------------------------------------------------
// 1) Create a Stripe Checkout session (USD only demo)
// ---------------------------------------------------------------------------
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured on server" });

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};

    const isUSD = String(currency || "").toUpperCase() === "USD";
    if (!isUSD) return res.status(400).json({ error: "Stripe demo expects USD price. Send currency: 'USD'." });

    const unitAmount = Math.round(Number(price) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${APP_URL}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout/cancel`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: title || "Artwork",
              images: imageUrl ? [imageUrl] : undefined,
              metadata: { artworkId, listingId },
            },
          },
        },
      ],
      metadata: { artworkId, listingId },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (e) {
    console.error("[create-stripe-session] error", e);
    res.status(500).json({ error: "Failed to create Stripe session" });
  }
});

// ---------------------------------------------------------------------------
// 2) Read a checkout session (client uses this on success page)
// GET /api/checkout/session?sid=cs_... -> { ok, session }
// ---------------------------------------------------------------------------
router.get("/session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
    const sid = req.query.sid;
    if (!sid) return res.status(400).json({ error: "Missing sid" });
    const session = await stripe.checkout.sessions.retrieve(sid);
    res.json({ ok: true, session });
  } catch (e) {
    console.error("[checkout/session] error", e);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// ---------------------------------------------------------------------------
// 3) Confirm a paid session and finalize the listing (idempotent)
// POST /api/checkout/confirm { sid }
// Requires Authorization: Bearer <supabase jwt>
// ---------------------------------------------------------------------------
router.post("/confirm", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { sid } = req.body || {};
    if (!sid) return res.status(400).json({ error: "Missing sid" });

    // Verify session is paid
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ error: "Session not paid" });
    }

    // Use metadata.listingId written at session creation time
    const listingId = session?.metadata?.listingId;
    if (!listingId) return res.status(400).json({ error: "Missing listing id in session metadata" });

    const result = await fillListing({ listingId, buyerId: user.id, txHash: session.payment_intent || null });
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[checkout/confirm] error", e);
    return res.status(500).json({ error: e?.message || "Failed to confirm" });
  }
});

// ---------------------------------------------------------------------------
// 4) Webhook (backstop) – handle checkout.session.completed
// NOTE: index.cjs mounts this with express.raw() BEFORE json middleware.
// ---------------------------------------------------------------------------
async function webhook(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    // Accept silently if not configured to avoid noisy logs in dev.
    return res.sendStatus(200);
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[webhook] signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const listingId = session?.metadata?.listingId;
      const buyerId = session?.customer_details?.email || null; // we’ll still need a platform user id

      // If you want to map Stripe customer/email -> platform user, do it here.
      // If not available, you can no-op and rely on client-side confirm,
      // or you can store a pending “paid but unclaimed” record to reconcile later.

      if (listingId && buyerId) {
        // If you *can* resolve a platform user id, call fillListing({ listingId, buyerId })
        // Otherwise skip to avoid transferring to an unknown account.
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("[webhook] handler error", e);
    res.status(500).send("Server error");
  }
}

module.exports = { router, webhook };
