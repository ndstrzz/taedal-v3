// server/index.cjs
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const { createClient } = require("@supabase/supabase-js");
const { dhash64, sha256Hex } = require("./utils/similarity.cjs");

const app = express();
app.set("trust proxy", 1);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ----------------------------- Config -----------------------------
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5000; // Render injects PORT; 5000 for local dev

const PINATA_JWT = process.env.PINATA_JWT || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Public client (only to resolve a passed JWT)
const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Admin client (bypasses RLS)
const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// ----------------------------- CORS & logs -----------------------------
const corsCfg = {
  origin: (_origin, cb) => cb(null, true),
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsCfg));
app.options("*", cors(corsCfg));

app.use((req, _res, next) => {
  console.log("[api]", req.method, req.path, "from", req.headers.origin || "no-origin");
  next();
});

// Resolve user from Authorization: Bearer <jwt>
async function getUserFromRequest(req) {
  try {
    if (!sb) return null;
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// ----------------------------- Checkout (safe mount) -----------------------------
let checkout = null;
try {
  checkout = require(path.join(__dirname, "checkout.cjs"));
  console.log("[checkout] loaded:", {
    hasRouter: !!checkout?.router,
    hasWebhook: typeof checkout?.webhook === "function",
  });
} catch (e) {
  console.warn("[checkout] not mounted:", e?.message || e);
}

// Webhook BEFORE json() (needs raw body)
if (checkout && typeof checkout.webhook === "function") {
  app.post("/api/checkout/webhook", express.raw({ type: "application/json" }), checkout.webhook);
} else {
  console.warn("[checkout] webhook missing — skipping /api/checkout/webhook");
}

// Normal JSON after webhook
app.use(express.json());

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Simple verify (used by create flow)
app.post("/api/verify", (_req, res) => res.json({ similar: [] }));

// Mount checkout router or install fallbacks (avoid 404s)
if (checkout?.router) {
  app.use("/api/checkout", checkout.router);
} else {
  console.warn("[checkout] router missing — installing fallbacks");
  app.get("/api/checkout/session", (req, res) => res.json({ ok: true, sid: String(req.query.sid || "") }));
  app.post("/api/checkout/create-stripe-session", (_req, res) =>
    res.status(501).json({ error: "Stripe not configured" })
  );
  app.post("/api/checkout/create-crypto-intent", (_req, res) =>
    res.status(501).json({ error: "Crypto checkout not configured" })
  );
}

// ----------------------------- Pinata -----------------------------
app.post("/api/pinata/pin-file", upload.single("file"), async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: "Server misconfigured: PINATA_JWT missing" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const form = new FormData();
    form.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    form.append(
      "pinataMetadata",
      JSON.stringify({ name: (req.body?.name || req.file.originalname || "upload").slice(0, 80) })
    );
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const { data } = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
      headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
      maxBodyLength: Infinity,
    });

    const cid = data.IpfsHash;
    res.json({ cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}` });
  } catch (err) {
    console.error("[pin-file] error", err?.response?.data || err.message);
    res.status(500).json({ error: "Pinning failed", details: err?.response?.data || err.message });
  }
});

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

    const { data } = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", meta, {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
    });

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

// ----------------------------- Hashes -----------------------------
app.post("/api/hashes", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.json({ dhash64: null, sha256: null, note: "no file" });
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
    }
    res.json({ dhash64: dhash, sha256: sha });
  } catch (e) {
    console.error("[hashes] unexpected:", e);
    res.json({ dhash64: null, sha256: null, note: "unexpected error" });
  }
});

// ----------------------------- Listings -----------------------------
app.post("/api/listings/create", async (req, res) => {
  try {
    if (!sbAdmin) return res.status(500).json({ error: "Supabase (admin) not configured" });

    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { artwork_id, price, currency = "ETH" } = req.body || {};
    if (!artwork_id || !price) return res.status(400).json({ error: "Missing artwork_id or price" });

    const { data: art, error: artErr } = await sbAdmin
      .from("artworks")
      .select("id, owner, status")
      .eq("id", artwork_id)
      .single();
    if (artErr) return res.status(404).json({ error: "Artwork not found" });
    if (art.owner !== user.id) return res.status(403).json({ error: "Forbidden (not the owner)" });

    const attempts = [];
    async function tryInsert(name, cols) {
      const { data, error } = await sbAdmin.from("listings").insert(cols).select("*").single();
      if (error) {
        attempts.push(`[${name}] ${error.code || ""} ${error.message || ""} ${error.details || ""}`.trim());
        return null;
      }
      return data;
    }

    const variants = [
      ["A", { artwork_id, lister: user.id, seller: user.id, price, price_eth: price, currency, status: "active" }],
      ["B", { artwork_id, lister: user.id, price, currency, status: "active" }],
      ["C", { artwork_id, seller: user.id, price_eth: price, currency, status: "active" }],
      ["D", { artwork_id, lister: user.id, seller: user.id, price_eth: price, currency, status: "active" }],
    ];

    for (const [name, cols] of variants) {
      const row = await tryInsert(name, cols);
      if (row) return res.json({ ok: true, listing: row });
    }

    return res.status(500).json({ error: "Insert failed. Tried variants A–D.", attempts });
  } catch (e) {
    console.error("[listings/create] unexpected:", e);
    res.status(500).json({ error: e?.message || "failed" });
  }
});

app.post("/api/listings/cancel", async (req, res) => {
  try {
    if (!sbAdmin) return res.status(500).json({ error: "Supabase (admin) not configured" });
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { listing_id } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });

    const { data: lst0, error: e0 } = await sbAdmin
      .from("listings")
      .select("id, artwork_id, lister, seller, status")
      .eq("id", listing_id)
      .single();
    if (e0 || !lst0) return res.status(404).json({ error: "Listing not found" });

    const { data: art0 } = await sbAdmin.from("artworks").select("owner").eq("id", lst0.artwork_id).single();
    const canCancel = [lst0.lister, lst0.seller, art0?.owner].includes(user.id);
    if (!canCancel) return res.status(403).json({ error: "Forbidden" });

    const { data: lst, error } = await sbAdmin
      .from("listings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", listing_id)
      .select("*")
      .single();
    if (error) throw error;

    await sbAdmin.from("activity").insert({
      artwork_id: lst.artwork_id,
      kind: "cancel_list",
      actor: user.id,
      note: "Listing cancelled",
    });

    res.json({ ok: true, listing: lst });
  } catch (e) {
    console.error("[listings/cancel]", e);
    res.status(500).json({ error: e?.message || "failed" });
  }
});

app.post("/api/listings/fill", async (req, res) => {
  try {
    if (!sbAdmin) return res.status(500).json({ error: "Supabase (admin) not configured" });
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { listing_id, tx_hash } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });

    const { data: lst, error: e1 } = await sbAdmin
      .from("listings")
      .update({ status: "filled", updated_at: new Date().toISOString() })
      .eq("id", listing_id)
      .select("*")
      .single();
    if (e1) throw e1;

    await sbAdmin.from("activity").insert({
      artwork_id: lst.artwork_id,
      kind: "buy",
      actor: user.id,
      tx_hash,
      note: `Bought for ${lst.price ?? lst.price_eth} ${lst.currency || "ETH"}`,
    });

    res.json({ ok: true, listing: lst });
  } catch (e) {
    console.error("[listings/fill]", e);
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// Debug
app.get("/api/_debug/supabase", (_req, res) => {
  res.json({
    hasUrl: !!process.env.SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    usingAdminClient: !!sbAdmin,
  });
});

// ----------------------------- Listen (guarded) -----------------------------
let started = false;
function start() {
  if (started) {
    console.warn("[server] start() called twice — ignoring");
    return;
  }
  started = true;

  const server = app.listen(PORT, HOST, () => {
    console.log(`API server listening on http://${HOST}:${PORT}`);
  });

  server.on("error", (err) => {
    console.error("[listen] error", err);
    process.exit(1);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
