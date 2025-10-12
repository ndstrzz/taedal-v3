// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// -------- ENV --------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://taedal-v3.vercel.app"; // <- your Vercel app URL

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Stripe + Supabase (admin for webhook)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Small helper to build absolute URLs to your frontend
function feUrl(path = "") {
  return `${FRONTEND_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// ---------- Health ----------
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    stripeConfigured: !!stripe,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    frontend: feUrl(""),
  });
});

// ---------- Create Stripe Checkout Session ----------
/**
 * Body (example):
 * {
 *   "name": "buy",
 *   "amount": 1200,          // amount in smallest unit (e.g. cents)
 *   "currency": "usd",
 *   "listing_id": "uuid..."  // optional: used to mark filled on webhook
 * }
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(501).json({ error: "Stripe not configured" });
    }

    const { name = "buy", amount, currency = "usd", listing_id } = req.body || {};
    // basic validation
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: String(currency).toLowerCase(),
            unit_amount: Math.round(amt),
            product_data: { name: String(name || "Item") },
          },
          quantity: 1,
        },
      ],
      success_url: feUrl("checkout/success?session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: feUrl("checkout/cancel"),
      metadata: listing_id ? { listing_id } : undefined,
    });

    return res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("[stripe] create session error:", e);
    return res.status(500).json({ error: "Failed to create session", details: e?.message });
  }
});

// ---------- Webhook (exported for index.cjs to mount with express.raw) ----------
async function webhook(req, res) {
  if (!STRIPE_WEBHOOK_SECRET) {
    // If you haven’t set a webhook secret yet, return 501 so Stripe retries later.
    return res.status(501).send("Webhook not configured");
  }
  if (!stripe) return res.status(501).send("Stripe not configured");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // req.body is a Buffer here because index.cjs mounts with express.raw
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

        // Optional: mark listing filled in Supabase
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
            // record activity
            await sbAdmin.from("activity").insert({
              artwork_id: data.artwork_id,
              kind: "buy",
              actor: session.customer || "stripe",
              tx_hash: session.payment_intent || null,
              note: `Card checkout via Stripe: ${session.currency?.toUpperCase()} ${(
                (session.amount_total || 0) / 100
              ).toFixed(2)}`,
            });
          }
        }
        break;
      }

      default:
        // Handle other events if you need to
        break;
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("[stripe] webhook processing error:", e);
    return res.status(500).send("server error");
  }
}

module.exports = { router, webhook };
