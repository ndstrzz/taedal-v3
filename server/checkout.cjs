// server/checkout.cjs
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

/**
 * POST /api/checkout/create-stripe-session
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured on server (STRIPE_SECRET_KEY missing)" });
    }

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};

    // Demo limitation: accept only USD for card checkout
    const isUSD = String(currency || "").toUpperCase() === "USD";
    if (!isUSD) {
      return res.status(400).json({ error: "Card checkout expects currency: 'USD' (convert price to USD first)." });
    }

    const unitAmount = Math.round(Number(price) * 100); // USD cents
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: "Invalid price amount" });
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

    res.json({ sessionId: session.id });
  } catch (e) {
    // bubble the real reason out to the client so you can see it in the toast
    console.error("[create-stripe-session] error:", e?.type, e?.message, e?.stack);
    res.status(e?.statusCode || 500).json({ error: e?.message || "Failed to create Stripe session" });
  }
});

/**
 * POST /api/checkout/create-crypto-intent
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 * TODO: Replace with Coinbase Commerce or another provider
 */
router.post("/create-crypto-intent", async (req, res) => {
  try {
    const { artworkId, listingId } = req.body || {};
    const hostedUrl = `${APP_URL}/checkout/crypto-placeholder?artwork=${encodeURIComponent(
      artworkId || ""
    )}&listing=${encodeURIComponent(listingId || "")}`;
    res.json({ hostedUrl, chargeId: "demo_charge_id" });
  } catch (e) {
    console.error("[create-crypto-intent] error:", e);
    res.status(500).json({ error: "Failed to create crypto intent" });
  }
});

module.exports = router;
