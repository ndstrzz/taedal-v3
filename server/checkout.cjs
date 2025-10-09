// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

/**
 * POST /api/checkout/create-stripe-session
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 *
 * Notes:
 * - For demo: we’ll always create a USD Checkout (even if the UI price is ETH/WETH).
 * - We return BOTH { url, sessionId } so the client can prefer `url` redirect,
 *   and still have a sessionId if you later want to use Stripe.js again.
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured on server" });

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};

    const unitAmount = Math.round(Number(price) * 100); // cents
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${APP_URL}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout/cancel`,
      // We always charge in USD here for simplicity; customize if you add FX.
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: title || "Artwork",
            images: imageUrl ? [imageUrl] : undefined,
            metadata: { artworkId, listingId, ui_currency: currency || "" }
          }
        }
      }],
      metadata: { artworkId, listingId, ui_currency: currency || "" },
    });

    // session.url is a complete redirect URL you can send the user to.
    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error("[create-stripe-session] error:", e);
    res.status(500).json({ error: "Failed to create Stripe session" });
  }
});

/**
 * Placeholder for crypto checkout
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
