// server/routes/market.cjs
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

// service client
const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// user client from incoming token
function userClient(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function insertActivity({ artwork_id, kind, actor, price, currency, tx_hash, note }) {
  await sbAdmin.from("activity").insert({
    artwork_id, kind, actor, tx_hash, note: note || null,
    price_eth: price ?? null,
    counterparty: null,
  });
}

// POST /api/market/list
router.post("/list", async (req, res) => {
  try {
    const { artwork_id, price, currency } = req.body || {};
    if (!artwork_id || !price) return res.status(400).json({ error: "Missing artwork_id or price" });

    const sb = userClient(req);
    const { data: user, error: uerr } = await sb.auth.getUser();
    if (uerr || !user?.user) return res.status(401).json({ error: "Unauthorized" });
    const actor = user.user.id;

    const { data, error } = await sbAdmin.from("listings").insert({
      artwork_id,
      lister: actor,
      status: "active",
      price,
      currency: currency || "ETH",
    }).select("*").single();
    if (error) throw error;

    await insertActivity({ artwork_id, kind: "list", actor, price, currency });
    res.json({ ok: true, listing: data });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// POST /api/market/buy
router.post("/buy", async (req, res) => {
  try {
    const { listing_id, tx_hash } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });

    const sb = userClient(req);
    const { data: user, error: uerr } = await sb.auth.getUser();
    if (uerr || !user?.user) return res.status(401).json({ error: "Unauthorized" });
    const buyer = user.user.id;

    const { data: lst, error: lerr } = await sbAdmin.from("listings").select("*").eq("id", listing_id).single();
    if (lerr || !lst) return res.status(404).json({ error: "Listing not found" });
    if (lst.status !== "active") return res.status(400).json({ error: "Listing not active" });

    const { error: uperr } = await sbAdmin.from("listings").update({ status: "filled" }).eq("id", listing_id);
    if (uperr) throw uperr;

    await insertActivity({
      artwork_id: lst.artwork_id,
      kind: "buy",
      actor: buyer,
      price: lst.price,
      currency: lst.currency,
      tx_hash,
      note: `buy listing ${listing_id}`,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// POST /api/market/cancel-listing
router.post("/cancel-listing", async (req, res) => {
  try {
    const { listing_id } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });

    const sb = userClient(req);
    const { data: user } = await sb.auth.getUser();
    if (!user?.user) return res.status(401).json({ error: "Unauthorized" });
    const actor = user.user.id;

    const { data: lst } = await sbAdmin.from("listings").select("*").eq("id", listing_id).single();
    if (!lst) return res.status(404).json({ error: "Listing not found" });
    if (lst.lister !== actor) return res.status(403).json({ error: "Only lister can cancel" });

    const { error } = await sbAdmin.from("listings").update({ status: "cancelled" }).eq("id", listing_id);
    if (error) throw error;

    await insertActivity({
      artwork_id: lst.artwork_id,
      kind: "cancel_list",
      actor,
      note: `cancel listing ${listing_id}`,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// POST /api/market/offer
router.post("/offer", async (req, res) => {
  try {
    const { artwork_id, price, currency } = req.body || {};
    if (!artwork_id || !price) return res.status(400).json({ error: "Missing artwork_id or price" });

    const sb = userClient(req);
    const { data: user } = await sb.auth.getUser();
    if (!user?.user) return res.status(401).json({ error: "Unauthorized" });
    const actor = user.user.id;

    const { data, error } = await sbAdmin.from("offers").insert({
      artwork_id,
      offerer: actor,
      price,
      currency: currency || "WETH",
    }).select("*").single();
    if (error) throw error;

    await insertActivity({ artwork_id, kind: "bid", actor, price, currency: currency || "WETH" });
    res.json({ ok: true, offer: data });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// POST /api/market/cancel-offer
router.post("/cancel-offer", async (req, res) => {
  try {
    const { offer_id } = req.body || {};
    if (!offer_id) return res.status(400).json({ error: "Missing offer_id" });

    const sb = userClient(req);
    const { data: user } = await sb.auth.getUser();
    if (!user?.user) return res.status(401).json({ error: "Unauthorized" });
    const actor = user.user.id;

    const { data: ofr } = await sbAdmin.from("offers").select("*").eq("id", offer_id).single();
    if (!ofr) return res.status(404).json({ error: "Offer not found" });
    if (ofr.offerer !== actor) return res.status(403).json({ error: "Only offerer can cancel" });

    const { error } = await sbAdmin.from("offers").update({ status: "cancelled" }).eq("id", offer_id);
    if (error) throw error;

    await insertActivity({ artwork_id: ofr.artwork_id, kind: "cancel_list", actor, note: `cancel offer ${offer_id}` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
