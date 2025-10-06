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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ── Config ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 5000);
const PINATA_JWT = process.env.PINATA_JWT || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ── CORS (localhost + your vercel app) ───────────────────────────────────────
// If you later add a custom domain, add it here.
const allowlist = [
  "http://localhost:5173",
  "https://taedal-v3.vercel.app",
  /\.vercel\.app$/i, // any *.vercel.app
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // SSR/cURL/no-origin
      const ok = allowlist.some((rule) =>
        typeof rule === "string" ? rule === origin : rule.test(origin)
      );
      if (ok) return cb(null, true);
      console.warn("[CORS] blocked origin:", origin);
      return cb(null, false);
    },
  })
);

// Tiny log helps a ton on Render logs
app.use((req, _res, next) => {
  console.log("[api]", req.method, req.path, "from", req.headers.origin || "no-origin");
  next();
});

app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    supabase: !!sb,
  })
);

// ── Pinata: pin-file ─────────────────────────────────────────────────────────
// expects multipart/form-data with field "file" (binary) and optional "name"
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
      {
        headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
        maxBodyLength: Infinity,
      }
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

// ── Pinata: pin metadata JSON ────────────────────────────────────────────────
// expects JSON: { name, description, image, properties? }
app.post("/api/metadata", async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: "Server misconfigured: PINATA_JWT missing" });

    const payload = req.body || {};
    const metadata = {
      name: String(payload.name || "Untitled"),
      description: String(payload.description || ""),
      image: payload.image || undefined, // e.g. "ipfs://..."
      properties: payload.properties || undefined,
    };

    const { data } = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      metadata,
      { headers: { Authorization: `Bearer ${PINATA_JWT}` } }
    );

    const cid = data.IpfsHash;
    res.json({
      metadata_cid: cid,
      metadata_url: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    });
  } catch (err) {
    console.error("[metadata] error", err?.response?.data || err.message);
    res.status(500).json({ error: "Pin JSON failed", details: err?.response?.data || err.message });
  }
});

// ── Hashing ──────────────────────────────────────────────────────────────────
// expects multipart/form-data with field "file"
app.post("/api/hashes", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const buf = req.file.buffer;
    const [dhash, sha] = await Promise.all([dhash64(buf), sha256Hex(buf)]);
    res.json({ dhash64: dhash, sha256: sha });
  } catch (e) {
    console.error("[hashes] error", e);
    res.status(500).json({ error: "hashing failed" });
  }
});

// ── Similarity verify ────────────────────────────────────────────────────────
// expects multipart/form-data with field "file"
// returns { matches: [...], note?: "..."}  (never 500 unless truly broken)
app.post("/api/verify", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const qHash = await dhash64(req.file.buffer);

    if (!sb) return res.json({ matches: [], note: "supabase not configured" });

    // If your RLS blocks anon reads, this will throw:
    const { data, error } = await sb
      .from("artworks")
      .select("id,title,owner,cover_url,dhash64,created_at")
      .eq("status", "published")
      .not("dhash64", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[verify] supabase error:", error.message);
      // return a soft success so the UI doesn't hard-fail
      return res.json({ matches: [], note: "supabase_select_error: " + error.message });
    }

    const SIM_THRESHOLD = 0.86; // ~<=9 bits different for 64-bit hash
    const matches = (data || [])
      .map((r) => {
        if (!r.dhash64) return null;
        const dist = hammingHex(qHash, r.dhash64);
        const score = 1 - dist / 64;
        return {
          id: r.id,
          title: r.title || "Untitled",
          username: "",
          user_id: r.owner,
          image_url: r.cover_url,
          score,
        };
      })
      .filter(Boolean)
      .filter((r) => r.score >= SIM_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    res.json({ matches });
  } catch (e) {
    // Only truly unexpected errors land here (e.g., bad buffer)
    console.error("[verify] error:", e);
    res.json({ matches: [], note: "verify_unexpected: " + (e?.message || String(e)) });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
