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
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 * Note: This demo endpoint expects USD. If you send ETH/WETH, we return 400.
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) {
      console.error("[stripe] missing STRIPE_SECRET_KEY");
      return res.status(500).json({ error: "Stripe not configured on server" });
    }

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};
    const isUSD = String(currency || "").toUpperCase() === "USD";

    if (!isUSD) {
      console.warn("[stripe] non-USD currency received:", currency);
      return res.status(400).json({ error: "This demo requires currency: 'USD'." });
    }

    const unitAmount = Math.round(Number(price) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      console.warn("[stripe] invalid amount:", price);
      return res.status(400).json({ error: "Invalid USD amount" });
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
    console.error("[stripe] create session error:", e?.message || e);
    res.status(500).json({ error: "Failed to create Stripe session" });
  }
});

/**
 * POST /api/checkout/create-crypto-intent
 * For now, returns a placeholder hosted page URL.
 */
router.post("/create-crypto-intent", async (req, res) => {
  try {
    const { artworkId, listingId } = req.body || {};
    const hostedUrl = `${APP_URL}/checkout/crypto-placeholder?artwork=${encodeURIComponent(
      artworkId || ""
    )}&listing=${encodeURIComponent(listingId || "")}`;
    res.json({ hostedUrl, chargeId: "demo_charge_id" });
  } catch (e) {
    console.error("[crypto] create intent error:", e?.message || e);
    res.status(500).json({ error: "Failed to create crypto intent" });
  }
});

module.exports = router;
