const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');
const { dhash64, sha256Hex, hammingHex } = require('./utils/similarity.cjs');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ---- Config ---------------------------------------------------------------

const PORT = Number(process.env.PORT || 5000);
const PINATA_JWT = process.env.PINATA_JWT || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ---- CORS (allow localhost & *.vercel.app & render) ----------------------
const allowlist = [
  'http://localhost:5173',
  /\.vercel\.app$/i,
  /^https?:\/\/.*onrender\.com$/i,
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = allowlist.some((rule) =>
        typeof rule === 'string' ? rule === origin : rule.test(origin)
      );
      if (ok) return cb(null, true);
      console.warn('[CORS] blocked origin:', origin);
      return cb(null, false);
    },
    credentials: false,
  })
);

// Lightweight request log
app.use((req, _res, next) => {
  console.log('[api]', req.method, req.path, 'from', req.headers.origin || 'no-origin');
  next();
});

app.use(express.json());

// ---- Healthcheck ----------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Stripe/Crypto checkout routes (mounted here) ------------------------
const checkoutRouter = require(path.join(__dirname, 'checkout.cjs'));
app.use('/api/checkout', checkoutRouter);

// ---- Pinata: pinFile ------------------------------------------------------

app.post('/api/pinata/pin-file', upload.single('file'), async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const name = (req.body?.name || req.file.originalname || 'upload').slice(0, 80);
    form.append('pinataMetadata', JSON.stringify({ name }));
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
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
    console.error('[pin-file] error', err?.response?.data || err.message);
    res.status(500).json({ error: 'Pinning failed', details: err?.response?.data || err.message });
  }
});

// ---- Pinata: pin metadata JSON -------------------------------------------

app.post('/api/metadata', async (req, res) => {
  try {
    if (!PINATA_JWT) {
      return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' });
    }

    const p = req.body || {};

    const image =
      typeof p.image === 'string' && p.image.trim()
        ? p.image.trim()
        : (p.imageCid ? `ipfs://${p.imageCid}` : undefined);

    // accept animation_url / animationUrl / animationCid
    const animation_url =
      typeof p.animation_url === 'string' && p.animation_url.trim()
        ? p.animation_url.trim()
        : (typeof p.animationUrl === 'string' && p.animationUrl.trim()
            ? p.animationUrl.trim()
            : (p.animationCid ? `ipfs://${p.animationCid}` : undefined));

    const meta = {
      name: String(p.name || 'Untitled'),
      description: String(p.description || ''),
      image,
      animation_url,
      attributes: p.attributes,
      properties: p.properties,
    };

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
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
    console.error('[metadata] error', err?.response?.data || err.message);
    res.status(500).json({ error: 'Pin JSON failed', details: err?.response?.data || err.message });
  }
});

// ---- Similarity / Hashing -------------------------------------------------
app.post('/api/hashes', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.warn('[hashes] no file field found');
      return res.json({ dhash64: null, sha256: null, note: 'no file' });
    }

    const buf = req.file.buffer;
    const mime = req.file.mimetype || '';

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

    return res.json({ dhash64: dhash, sha256: sha });
  } catch (e) {
    console.error('[hashes] unexpected error:', e);
    return res.json({ dhash64: null, sha256: null, note: 'unexpected error' });
  }
});

// ---- Similarity search (soft-timeout) ------------------------------------
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

// ---- Off-chain listing / activity endpoints -------------------------------

app.post('/api/activity/list', express.json(), async (req, res) => {
  try {
    const { artwork_id, actor, price, currency='ETH' } = req.body || {};
    if (!artwork_id || !actor) return res.status(400).json({ error: 'artwork_id & actor required' });

    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { error: upErr } = await sb.from('artworks').update({
      sale_kind: 'fixed',
      sale_currency: currency,
      sale_price: price
    }).eq('id', artwork_id);
    if (upErr) throw upErr;

    const { error: actErr } = await sb.from('activity').insert({
      artwork_id, actor, kind: 'list', data: { price, currency }
    });
    if (actErr) throw actErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[list] error', e);
    res.status(500).json({ error: 'list failed', details: e.message });
  }
});

app.post('/api/activity/unlist', express.json(), async (req, res) => {
  try {
    const { artwork_id, actor } = req.body || {};
    if (!artwork_id || !actor) return res.status(400).json({ error: 'artwork_id & actor required' });

    const { error: upErr } = await sb.from('artworks').update({
      sale_kind: null,
      sale_price: null
    }).eq('id', artwork_id);
    if (upErr) throw upErr;

    const { error: actErr } = await sb.from('activity').insert({
      artwork_id, actor, kind: 'unlist'
    });
    if (actErr) throw actErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[unlist] error', e);
    res.status(500).json({ error: 'unlist failed', details: e.message });
  }
});

app.post('/api/activity/offer', express.json(), async (req, res) => {
  try {
    const { artwork_id, actor, price, currency='ETH' } = req.body || {};
    if (!artwork_id || !actor || !price) return res.status(400).json({ error: 'artwork_id, actor, price required' });

    const { error: actErr } = await sb.from('activity').insert({
      artwork_id, actor, kind: 'offer', data: { price, currency }
    });
    if (actErr) throw actErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[offer] error', e);
    res.status(500).json({ error: 'offer failed', details: e.message });
  }
});

app.post('/api/activity/sale', express.json(), async (req, res) => {
  try {
    const { artwork_id, actor, price, currency='ETH', tx_hash } = req.body || {};
    if (!artwork_id || !actor || !price) return res.status(400).json({ error: 'artwork_id, actor, price required' });

    // Clear listing on artwork
    const { error: upErr } = await sb.from('artworks').update({
      sale_kind: null,
      sale_price: null
    }).eq('id', artwork_id);
    if (upErr) throw upErr;

    const { error: actErr } = await sb.from('activity').insert({
      artwork_id, actor, kind: 'sale', tx_hash, data: { price, currency }
    });
    if (actErr) throw actErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[sale] error', e);
    res.status(500).json({ error: 'sale failed', details: e.message });
  }
});

app.post('/api/admin/refresh-traits', async (_req, res) => {
  try {
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const { error } = await sb.rpc('refresh_trait_stats_mat');
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[refresh-traits] error', e);
    res.status(500).json({ error: 'refresh failed', details: e.message });
  }
});

// Listings mini-API ---------------------------------------------------------

app.post('/api/listings/create', express.json(), async (req, res) => {
  try {
    const { artwork_id, lister, price, currency = 'ETH' } = req.body || {};
    if (!artwork_id || !lister || !price) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await sb
      .from('listings')
      .insert({ artwork_id, lister, price, currency })
      .select('*').single();
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

    const { data: lst, error: e0 } = await sb.from('listings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', listing_id)
      .select('*').single();
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

    const { data: lst, error: e1 } = await sb.from('listings')
      .update({ status: 'filled', updated_at: new Date().toISOString() })
      .eq('id', listing_id)
      .select('*').single();
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

// ---- Start ----------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
