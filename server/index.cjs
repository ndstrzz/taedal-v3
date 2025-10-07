const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const multer = require('multer')
const axios = require('axios')
const cors = require('cors')
const FormData = require('form-data')
const { createClient } = require('@supabase/supabase-js')
const { dhash64, sha256Hex, hammingHex } = require('./utils/similarity.cjs')

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// ---- Config ---------------------------------------------------------------

const PORT = Number(process.env.PORT || 5000)
const PINATA_JWT = process.env.PINATA_JWT || ''
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

// ---- CORS (allow localhost & *.vercel.app & render) ----------------------

const allowlist = [
  'http://localhost:5173',
  /\.vercel\.app$/i,
  /^https?:\/\/.*onrender\.com$/i,
]

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      const ok = allowlist.some((rule) =>
        typeof rule === 'string' ? rule === origin : rule.test(origin)
      )
      if (ok) return cb(null, true)
      console.warn('[CORS] blocked origin:', origin)
      return cb(null, false)
    },
    credentials: false,
  })
)

// Lightweight request log
app.use((req, _res, next) => {
  console.log('[api]', req.method, req.path, 'from', req.headers.origin || 'no-origin')
  next()
})

app.use(express.json())

// ---- Healthcheck ----------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ---- Pinata: pinFile ------------------------------------------------------

app.post('/api/pinata/pin-file', upload.single('file'), async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const form = new FormData()
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    })

    const name = (req.body?.name || req.file.originalname || 'upload').slice(0, 80)
    form.append('pinataMetadata', JSON.stringify({ name }))
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      form,
      {
        headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
        maxBodyLength: Infinity,
      }
    )

    const cid = data.IpfsHash
    res.json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    })
  } catch (err) {
    console.error('[pin-file] error', err?.response?.data || err.message)
    res.status(500).json({ error: 'Pinning failed', details: err?.response?.data || err.message })
  }
})

// ---- Pinata: pin metadata JSON -------------------------------------------

app.post('/api/metadata', async (req, res) => {
  try {
    if (!PINATA_JWT) {
      return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' })
    }

    const p = req.body || {}

    const image =
      typeof p.image === 'string' && p.image.trim()
        ? p.image.trim()
        : (p.imageCid ? `ipfs://${p.imageCid}` : undefined)

    // accept animation_url / animationUrl / animationCid
    const animation_url =
      typeof p.animation_url === 'string' && p.animation_url.trim()
        ? p.animation_url.trim()
        : (typeof p.animationUrl === 'string' && p.animationUrl.trim()
            ? p.animationUrl.trim()
            : (p.animationCid ? `ipfs://${p.animationCid}` : undefined))

    const meta = {
      name: String(p.name || 'Untitled'),
      description: String(p.description || ''),
      image,
      animation_url,
      attributes: p.attributes,
      properties: p.properties,
    }

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      meta,
      { headers: { Authorization: `Bearer ${PINATA_JWT}` } }
    )

    const cid = data.IpfsHash
    res.json({
      metadata_cid: cid,
      metadata_url: `ipfs://${cid}`,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    })
  } catch (err) {
    console.error('[metadata] error', err?.response?.data || err.message)
    res.status(500).json({ error: 'Pin JSON failed', details: err?.response?.data || err.message })
  }
})

// ---- Similarity / Hashing -------------------------------------------------
app.post('/api/hashes', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.warn('[hashes] no file field found');
      // Always succeed with a soft response so the client can continue
      return res.json({ dhash64: null, sha256: null, note: 'no file' });
    }

    const buf = req.file.buffer;
    const mime = req.file.mimetype || '';

    // sha256 is always available and cheap
    const sha = sha256Hex(buf);

    let dhash = null;
    if (mime.startsWith('image/')) {
      try {
        dhash = await dhash64(buf);
      } catch (e) {
        console.warn('[hashes] dHash failed (image decode):', e?.message || e);
      }
    } else {
      console.log('[hashes] skipped dHash (non-image):', mime);
    }

    // Always 200 so the client flow never breaks
    return res.json({ dhash64: dhash, sha256: sha });
  } catch (e) {
    console.error('[hashes] unexpected error:', e);
    // Still reply 200 with nulls; client can proceed
    return res.json({ dhash64: null, sha256: null, note: 'unexpected error' });
  }
});


// robust: accept 'artwork' OR 'file' + soft timeout
app.post('/api/verify', upload.any(), async (req, res) => {
  const TIME_LIMIT = 12_000;
  let responded = false;
  const softTimer = setTimeout(() => {
    if (!responded && !res.headersSent) {
      responded = true;
      return res.json({ query: null, similar: [], matches: [] });
    }
  }, TIME_LIMIT);

  try {
    const pick = (req.files || []).find((x) => x.fieldname === 'artwork') ||
                 (req.files || []).find((x) => x.fieldname === 'file');

    if (!pick) {
      console.warn('[verify] no file in', (req.files || []).map(f => f.fieldname));
      if (!responded) {
        responded = true;
        return res.json({ query: null, similar: [], matches: [] });
      }
      return;
    }

    const qHash = await dhash64(pick.buffer);

    if (!sb) {
      if (!responded) {
        responded = true;
        return res.json({ query: qHash, similar: [], matches: [] });
      }
      return;
    }

    const { data, error } = await sb
      .from('artworks')
      .select('id,title,owner,cover_url,dhash64')
      .eq('status', 'published')
      .not('dhash64', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const SIM_THRESHOLD = 0.86;
    const results = (data || [])
      .map((r) => {
        if (!r.dhash64) return null;
        const dist = hammingHex(qHash, r.dhash64);
        const score = 1 - dist / 64;
        return {
          id: r.id,
          title: r.title || 'Untitled',
          username: '',
          user_id: r.owner,
          image_url: r.cover_url,
          score,
        };
      })
      .filter(Boolean)
      .filter((r) => r.score >= SIM_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (!responded) {
      responded = true;
      return res.json({ query: qHash, similar: results, matches: results });
    }
  } catch (e) {
    console.error('[verify] error', e);
    if (!responded) {
      responded = true;
      return res.json({ query: null, similar: [], matches: [] });
    }
  } finally {
    clearTimeout(softTimer);
  }
});

// ---- Start ----------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`)
})
