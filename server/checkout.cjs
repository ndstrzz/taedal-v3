// server/checkout.cjs
const express = require("express");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// ---- env
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FRONTEND = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn("[checkout] STRIPE_SECRET_KEY missing");
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const sbAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// currencies with 0 decimals in Stripe (no “cents”)
const ZERO_DECIMAL = new Set(["jpy", "krw"]);

// GET /api/checkout/health
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stripeConfigured: !!stripe,
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    frontend: FRONTEND,
  });
});

// POST /api/checkout/create-stripe-session
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
    if (!sbAdmin) return res.status(500).json({ error: "Supabase admin not configured" });

    const { listing_id, success_url, cancel_url } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "listing_id required" });

    // fetch the listing + a bit of artwork data for display
    const { data: lst, error } = await sbAdmin
      .from("listings")
      .select("id, price, price_eth, currency, artwork:artworks(name, image_url)")
      .eq("id", listing_id)
      .single();

    if (error || !lst) return res.status(404).json({ error: "Listing not found" });

    // figure out currency + numeric price
    const currency = String(lst.currency || "usd").toLowerCase();
    const priceNumber = Number(
      lst.price ?? lst.price_eth // choose whichever your app uses for fiat
    );
    if (!Number.isFinite(priceNumber)) {
      return res.status(400).json({ error: "Invalid price on listing" });
    }

    // convert to smallest unit integer
    let unitAmount;
    if (ZERO_DECIMAL.has(currency)) {
      unitAmount = Math.round(priceNumber); // JPY/KRW: no cents
    } else {
      unitAmount = Math.round(priceNumber * 100); // e.g. USD cents
    }
    if (unitAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: lst.artwork?.name || "Artwork",
              images: lst.artwork?.image_url ? [lst.artwork.image_url] : [],
            },
          },
          quantity: 1,
        },
      ],
      success_url: success_url || `${FRONTEND}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${FRONTEND}/checkout/cancel`,
      metadata: { listing_id: String(lst.id) },
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e) {
    console.error("[create-stripe-session] error:", e?.raw || e);
    const msg = e?.raw?.message || e?.message || "Stripe error";
    return res.status(400).json({ error: msg });
  }
});

module.exports = {
  router,
  // keep your webhook export here if you have one:
  webhook: module.exports?.webhook,
};
