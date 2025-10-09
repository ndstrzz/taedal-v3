// server/checkout.cjs
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

// Required env
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

// Optional: static conversion rate for demo/testing (e.g., 3200 = $3,200 per ETH)
const ETH_USD_RATE = Number(process.env.ETH_USD_RATE || "0");

// Init Stripe if key exists
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

/**
 * Normalize the incoming { price, currency } to a USD amount (in cents) for Stripe.
 * - If currency is 'USD': just use the given price.
 * - If currency is 'ETH' or 'WETH': multiply by ETH_USD_RATE (must be set).
 */
function toUsdCents({ price, currency }) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid price number");

  const cur = String(currency || "").toUpperCase();
  if (cur === "USD") {
    return Math.round(p * 100);
  }

  if (cur === "ETH" || cur === "WETH") {
    if (!ETH_USD_RATE || !Number.isFinite(ETH_USD_RATE) || ETH_USD_RATE <= 0) {
      throw new Error("Server missing ETH_USD_RATE to convert crypto → USD");
    }
    return Math.round(p * ETH_USD_RATE * 100);
  }

  throw new Error(`Unsupported currency: ${currency}`);
}

/**
 * POST /api/checkout/create-stripe-session
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured on server" });

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};
    if (!price || !currency) return res.status(400).json({ error: "Missing price or currency" });

    // Convert incoming price to USD cents for Stripe
    const unit_amount = toUsdCents({ price, currency });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${APP_URL}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout/cancel`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount,
            product_data: {
              name: title || "Artwork",
              images: imageUrl ? [imageUrl] : undefined,
              metadata: { artworkId, listingId, origin_currency: currency, origin_price: String(price) },
            },
          },
        },
      ],
      metadata: { artworkId, listingId, origin_currency: currency, origin_price: String(price) },
    });

    res.json({ sessionId: session.id });
  } catch (e) {
    console.error("[create-stripe-session] error:", e);
    res.status(400).json({ error: e?.message || "Failed to create Stripe session" });
  }
});

/**
 * POST /api/checkout/create-crypto-intent
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 * Placeholder – replace with Coinbase Commerce or your own flow.
 */
router.post("/create-crypto-intent", async (req, res) => {
  try {
    const { artworkId, listingId } = req.body || {};
    const hostedUrl = `${APP_URL}/checkout/crypto-placeholder?artwork=${encodeURIComponent(
      artworkId || ""
    )}&listing=${encodeURIComponent(listingId || "")}`;
    res.json({ hostedUrl, chargeId: "demo_charge_id" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create crypto intent" });
  }
});

module.exports = router;
