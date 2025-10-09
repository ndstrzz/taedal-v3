// server/index.cjs
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const { createClient } = require("@supabase/supabase-js");
const { dhash64, sha256Hex, hammingHex } = require("./utils/similarity.cjs");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------
const PORT = Number(process.env.PORT || 5000);
const PINATA_JWT = process.env.PINATA_JWT || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ------------------------------------------------------------------
// CORS (permissive + preflight with Authorization allowed)
// ------------------------------------------------------------------
const corsCfg = {
  origin: (_origin, cb) => cb(null, true), // allow all origins (simplest + reliable)
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsCfg));
app.options("*", cors(corsCfg)); // ensure every preflight gets ACAO

// tiny request log
app.use((req, _res, next) => {
  console.log("[api]", req.method, req.path, "from", req.headers.origin || "no-origin");
  next();
});

// ------------------------------------------------------------------
// Stripe webhook must receive RAW body (before express.json())
// ------------------------------------------------------------------
const { router: checkoutRouter, webhook: checkoutWebhook } = require(path.join(__dirname, "checkout.cjs"));
app.post("/api/checkout/webhook", express.raw({ type: "application/json" }), checkoutWebhook);

// ------------------------------------------------------------------
// Then enable JSON for the rest of the API
// ------------------------------------------------------------------
app.use(express.json());

// ------------------------------------------------------------------
// Health
// ------------------------------------------------------------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ------------------------------------------------------------------
// Stripe/Crypto + Market routes
// ------------------------------------------------------------------
app.use("/api/checkout", checkoutRouter);

try {
  const marketRouter = require(path.join(__dirname, "routes", "market.cjs"));
  app.use("/api/market", marketRouter);
} catch (e) {
  console.warn("[market] routes not mounted:", e?.message || e);
}

// ------------------------------------------------------------------
// Pinata: pin file
// ------------------------------------------------------------------
app.post("/api/pinata/pin-file", upload.single("file"), async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: "Server misconfigured: PINATA_JWT missing" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const name = (req.body?.name || req.file.originalname || "upload").slice(0, 80);
    form.append("pinataMetadata", JSON.stringify({ name }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const { data } = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      form,
      { headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() }, maxBodyLength: Infinity }
    );

    const cid = data.IpfsHash;
    res.json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    });
  } catch (err) {
    console.error("[pin-file] error", err?.response?.data || err.message);
    res.status(500).json({ error: "Pinning failed", details: err?.response?.data || err.message });
  }
});

// ------------------------------------------------------------------
// Pinata: pin metadata
// ------------------------------------------------------------------
app.post("/api/metadata", async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: "Server misconfigured: PINATA_JWT missing" });

    const p = req.body || {};

    const image =
      typeof p.image === "string" && p.image.trim()
        ? p.image.trim()
        : p.imageCid
        ? `ipfs://${p.imageCid}`
        : undefined;

    const animation_url =
      typeof p.animation_url === "string" && p.animation_url.trim()
        ? p.animation_url.trim()
        : typeof p.animationUrl === "string" && p.animationUrl.trim()
        ? p.animationUrl.trim()
        : p.animationCid
        ? `ipfs://${p.animationCid}`
        : undefined;

    const meta = {
      name: String(p.name || "Untitled"),
      description: String(p.description || ""),
      image,
      animation_url,
      attributes: p.attributes,
      properties: p.properties,
    };

    const { data } = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      meta,
      { headers: { Authorization: `Bearer ${PINATA_JWT}` } }
    );

    const cid = data.IpfsHash;
    res.json({
      metadata_cid: cid,
      metadata_url: `ipfs://${cid}`,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    });
  } catch (err) {
    console.error("[metadata] error", err?.response?.data || err.message);
    res.status(500).json({ error: "Pin JSON failed", details: err?.response?.data || err.message });
  }
});

// ------------------------------------------------------------------
// Hashes
// ------------------------------------------------------------------
app.post("/api/hashes", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.warn("[hashes] no file field found");
      return res.json({ dhash64: null, sha256: null, note: "no file" });
    }

    const buf = req.file.buffer;
    const mime = req.file.mimetype || "";
    const sha = sha256Hex(buf);

    let dhash = null;
    if (mime.startsWith("image/")) {
      try {
        dhash = await dhash64(buf);
      } catch (e) {
        console.warn("[hashes] dHash failed:", e?.message || e);
      }
    } else {
      console.log("[hashes] skipped dHash (non-image):", mime);
    }

    res.json({ dhash64: dhash, sha256: sha });
  } catch (e) {
    console.error("[hashes] unexpected error:", e);
    res.json({ dhash64: null, sha256: null, note: "unexpected error" });
  }
});

// --- Mini Listings API (off-chain) -----------------------------------------
app.post('/api/listings/create', express.json(), async (req, res) => {
  try {
    const { artwork_id, lister, price, currency = 'ETH' } = req.body || {};
    if (!artwork_id || !lister || !price) return res.status(400).json({ error: 'Missing fields' });

    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb
      .from('listings')
      .insert({ artwork_id, lister, price, currency, status: 'active' })
      .select('*')
      .single();
    if (error) throw error;

    await sb.from('activity').insert({
      artwork_id,
      kind: 'list',
      actor: lister,
      note: `Listed for ${price} ${currency}`
    });

    res.json({ ok: true, listing: data });
  } catch (e) {
    console.error('[listings/create]', e);
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/listings/cancel', express.json(), async (req, res) => {
  try {
    const { listing_id, actor } = req.body || {};
    if (!listing_id || !actor) return res.status(400).json({ error: 'Missing fields' });

    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data: lst, error: e0 } = await sb
      .from('listings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', listing_id)
      .select('*')
      .single();
    if (e0) throw e0;

    await sb.from('activity').insert({
      artwork_id: lst.artwork_id,
      kind: 'cancel_list',
      actor,
      note: 'Listing cancelled'
    });

    res.json({ ok: true, listing: lst });
  } catch (e) {
    console.error('[listings/cancel]', e);
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/listings/fill', express.json(), async (req, res) => {
  try {
    const { listing_id, buyer, tx_hash } = req.body || {};
    if (!listing_id || !buyer) return res.status(400).json({ error: 'Missing fields' });

    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data: lst, error: e1 } = await sb
      .from('listings')
      .update({ status: 'filled', updated_at: new Date().toISOString() })
      .eq('id', listing_id)
      .select('*')
      .single();
    if (e1) throw e1;

    await sb.from('activity').insert({
      artwork_id: lst.artwork_id,
      kind: 'buy',
      actor: buyer,
      tx_hash,
      note: `Bought for ${lst.price} ${lst.currency}`
    });

    res.json({ ok: true, listing: lst });
  } catch (e) {
    console.error('[listings/fill]', e);
    res.status(500).json({ error: 'failed' });
  }
});


// ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
