// server/checkout.cjs
const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// -------- ENV --------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://taedal-v3.vercel.app"; // your Vercel app URL

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Stripe + Supabase (admin for listing lookups and webhook updates)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// ---------- Helpers ----------
function feUrl(path = "") {
  return `${FRONTEND_URL.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

// Stripe-accepted fiat currencies (not exhaustive, good coverage)
const ALLOWED_FIAT = new Set([
  "usd","eur","gbp","aud","cad","nzd","sgd","chf","sek","dkk","nok","pln",
  "czk","huf","ils","mxn","brl","clp","ars","try","zar","aed","sar","inr",
  "jpy","krw","thb","php","twd","hkd","myr","idr","vnd","ron","bgn","hrk"
]);
const ZERO_DECIMAL = new Set(["jpy","krw"]); // no cents

function pickFiatCurrency(raw) {
  const c = String(raw || "usd").toLowerCase();
  return ALLOWED_FIAT.has(c) ? c : "usd";
}

// Choose a fiat price from a listing (avoid crypto fields)
function pickFiatPrice(row) {
  const candidates = [row?.price, row?.price_usd, row?.price_fiat];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function toStripeUnitAmount(amountNumber, currency) {
  return ZERO_DECIMAL.has(currency)
    ? Math.round(amountNumber)
    : Math.round(amountNumber * 100);
}

// ---------- Health ----------
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stripeConfigured: !!stripe,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    frontend: feUrl(""),
  });
});

// ---------- Create Stripe Checkout Session ----------
//
// Accepts either:
//  A) { listing_id }  -> server looks up listing and computes valid fiat amount
//  B) { amount, currency, name, success_url, cancel_url } -> (optional) manual override
//
router.post("/create-stripe-session", async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ error: "Stripe not configured" });

    const {
      listing_id,
      amount,          // optional override (number in smallest unit if you also set `raw_smallest_unit: true`)
      currency,        // optional override (fiat, e.g. "usd")
      name,            // optional product name
      success_url,     // optional
      cancel_url,      // optional
      raw_smallest_unit // optional boolean: true if `amount` already in Stripe's smallest unit
    } = req.body || {};

    let finalCurrency, finalAmountNumber, productName = "Artwork";
    let productImage = undefined;

    if (listing_id && sbAdmin) {
      // Pull listing & artwork
      const { data: lst, error } = await sbAdmin
        .from("listings")
        .select("id, price, price_usd, price_fiat, price_eth, currency, artwork:artworks(name, image_url)")
        .eq("id", listing_id)
        .single();

      if (error || !lst) return res.status(404).json({ error: "Listing not found" });

      finalCurrency = pickFiatCurrency(lst.currency);
      finalAmountNumber = pickFiatPrice(lst); // use fiat number
      productName = lst.artwork?.name || name || productName;
      if (lst.artwork?.image_url) productImage = [lst.artwork.image_url];
    }

    // Allow explicit overrides from client (useful for testing)
    if (Number.isFinite(Number(amount)) && Number(amount) > 0) {
      // if raw_smallest_unit=true, amount is already in smallest unit
      if (raw_smallest_unit) {
        finalAmountNumber = Number(amount);
      } else {
        // amount provided as normal decimal (e.g. 12); convert below with currency
        finalAmountNumber = Number(amount);
      }
    }
    if (currency) finalCurrency = pickFiatCurrency(currency);
    if (!finalCurrency) finalCurrency = "usd";
    if (!productName) productName = name || "Artwork";

    // If we still don't have a fiat amount, it's invalid
    if (!Number.isFinite(finalAmountNumber) || finalAmountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount (no valid fiat price found)" });
    }

    // Convert to Stripe smallest unit if needed
    const unitAmount = raw_smallest_unit
      ? Math.round(finalAmountNumber)
      : toStripeUnitAmount(finalAmountNumber, finalCurrency);

    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount after conversion" });
    }

    console.log("[stripe] create session ->", {
      listing_id,
      currency: finalCurrency,
      displayAmount: finalAmountNumber,
      unitAmount,
      productName,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: finalCurrency,
            unit_amount: unitAmount,
            product_data: {
              name: productName,
              images: productImage || [],
            },
          },
          quantity: 1,
        },
      ],
      success_url: success_url || feUrl("checkout/success?session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: cancel_url || feUrl("checkout/cancel"),
      metadata: listing_id ? { listing_id: String(listing_id) } : undefined,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e) {
    console.error("[create-stripe-session] error:", e?.raw || e);
    return res.status(400).json({ error: e?.raw?.message || e?.message || "Stripe error" });
  }
});

// ---------- Webhook (mounted with express.raw in index.cjs) ----------
async function webhook(req, res) {
  if (!STRIPE_WEBHOOK_SECRET) return res.status(501).send("Webhook not configured");
  if (!stripe) return res.status(501).send("Stripe not configured");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // req.body is a Buffer because index.cjs mounts: express.raw({ type: "application/json" })
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe] webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const listingId = session.metadata?.listing_id;

      if (listingId && sbAdmin) {
        const { data, error } = await sbAdmin
          .from("listings")
          .update({ status: "filled", updated_at: new Date().toISOString() })
          .eq("id", listingId)
          .select("*")
          .single();

        if (error) {
          console.error("[webhook] supabase update failed:", error);
        } else {
          await sbAdmin.from("activity").insert({
            artwork_id: data.artwork_id,
            kind: "buy",
            actor: session.customer || "stripe",
            tx_hash: session.payment_intent || null,
            note: `Card checkout via Stripe: ${String(session.currency || "").toUpperCase()} ${(
              ((session.amount_total || 0) / 100) || 0
            ).toFixed(2)}`,
          });
        }
      }
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("[stripe] webhook processing error:", e);
    return res.status(500).send("server error");
  }
}

module.exports = { router, webhook };
