// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

/**
 * POST /api/checkout/create-stripe-session
 * Creates a Stripe Checkout Session for a USD payment.
 */
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

/**
 * Optional: demo “crypto intent” to keep your UI flows.
 */
router.post("/create-crypto-intent", async (req, res) => {
  try {
    const { artworkId, listingId } = req.body || {};
    const hostedUrl = `${APP_URL}/checkout/crypto-placeholder?artwork=${encodeURIComponent(
      artworkId || ""
    )}&listing=${encodeURIComponent(listingId || "")}`;
    res.json({ hostedUrl, chargeId: "demo_charge_id" });
  } catch (e) {
    console.error("[create-crypto-intent] error", e);
    res.status(500).json({ error: "Failed to create crypto intent" });
  }
});

/**
 * NEW: GET /api/checkout/session?sid=cs_...
 * Success page calls this to confirm the payment result.
 */
router.get("/session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured on server" });

    const sid = String(req.query.sid || "");
    if (!sid) return res.status(400).json({ error: "Missing sid" });

    const session = await stripe.checkout.sessions.retrieve(sid, {
      expand: ["payment_intent", "line_items"],
    });

    // Return a compact, UI-friendly payload
    res.json({
      id: session.id,
      status: session.status,                   // 'complete' | 'open' | ...
      payment_status: session.payment_status,   // 'paid' | 'unpaid' | 'no_payment_required'
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || null,
      metadata: session.metadata || {},
    });
  } catch (e) {
    // 404 if session is not found/invalid
    res.status(404).json({ error: e.message || "Session not found" });
  }
});

/**
 * Webhook placeholder (keep raw body in index.cjs before JSON middleware)
 */
function webhook(_req, res) {
  res.sendStatus(200);
}

module.exports = { router, webhook };
