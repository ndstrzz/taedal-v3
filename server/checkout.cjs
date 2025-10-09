// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const { createClient } = require("@supabase/supabase-js");

const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

// service client for webhook writes
const sbAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * POST /api/checkout/create-stripe-session
 * body: { artworkId, listingId, title, price, currency, imageUrl }
 */
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ error: "Stripe not configured" });

    const { artworkId, listingId, title, price, currency, imageUrl } = req.body || {};

    // Simple demo: only USD
    const isUSD = (String(currency || "").toUpperCase() === "USD");
    if (!isUSD) {
      return res.status(400).json({ error: "Stripe demo expects USD price. Send currency: 'USD'." });
    }

    const unitAmount = Math.round(Number(price) * 100); // cents
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${APP_URL}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout/cancel`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: title || "Artwork",
            images: imageUrl ? [imageUrl] : undefined,
            metadata: { artworkId, listingId }
          }
        }
      }],
      metadata: { artworkId, listingId },
    });

    res.json({ sessionId: session.id });
  } catch (e) {
    console.error('[create-stripe-session]', e);
    res.status(500).json({ error: "Failed to create Stripe session" });
  }
});

/**
 * POST /api/checkout/create-crypto-intent
 * Placeholder for Coinbase Commerce (or similar).
 */
router.post("/create-crypto-intent", async (req, res) => {
  try {
    const { artworkId, listingId } = req.body || {};
    const hostedUrl = `${APP_URL}/checkout/crypto-placeholder?artwork=${encodeURIComponent(artworkId || '')}&listing=${encodeURIComponent(listingId || '')}`;
    res.json({ hostedUrl, chargeId: "demo_charge_id" });
  } catch (e) {
    console.error('[create-crypto-intent]', e);
    res.status(500).json({ error: "Failed to create crypto intent" });
  }
});

/**
 * POST /api/checkout/webhook
 * Stripe webhook to mark listing filled + create activity
 *
 * IMPORTANT: this route must use raw body (set in index via router-level override).
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      if (!stripe) return res.status(400).send("Stripe not configured");
      const sig = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return res.status(400).send("No webhook secret");

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } catch (err) {
        console.error("[webhook] signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        if (!sbAdmin) {
          console.warn("[webhook] sbAdmin not configured; skipping DB write");
        } else {
          const s = event.data.object;
          // metadata from session or line item product
          const artworkId = s?.metadata?.artworkId || null;
          const listingId = s?.metadata?.listingId || null;

          if (listingId) {
            // mark listing filled
            const { data: lst, error: e1 } = await sbAdmin
              .from("listings")
              .update({ status: "filled", updated_at: new Date().toISOString() })
              .eq("id", listingId)
              .select("*")
              .single();
            if (e1) console.error("[webhook] listings update error", e1);

            if (lst) {
              // activity
              const price = lst.price;
              const currency = lst.currency || "USD";
              const buyer = "stripe_checkout"; // unknown buyer ID (unless you attach auth)
              const { error: e2 } = await sbAdmin.from("activity").insert({
                artwork_id: lst.artwork_id,
                kind: "buy",
                actor: buyer,
                price_eth: currency.toUpperCase() === "ETH" ? price : null,
                tx_hash: s?.payment_intent || null,
                note: `Stripe charge ${s?.id} for listing ${listingId}`,
              });
              if (e2) console.error("[webhook] activity insert error", e2);
            }
          }
        }
      }

      res.json({ received: true });
    } catch (e) {
      console.error('[webhook]', e);
      res.status(500).send("Webhook handler failed");
    }
  }
);

module.exports = router;
