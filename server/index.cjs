// server/index.cjs
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

const PORT = process.env.PORT || 5000
const PINATA_JWT = process.env.PINATA_JWT || ''
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

const sb = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://<your-vercel-project>.vercel.app', // add this now, update later if you add a custom domain
  ],
  credentials: false,
}))

app.use(express.json())

// Healthcheck
app.get('/api/health', (_, res) => res.json({ ok: true }))

// ---------------- IPFS / Pinata ----------------

// Pin a file to IPFS via Pinata
app.post('/api/pinata/pin-file', upload.single('file'), async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const form = new FormData()
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype })

    const name = (req.body.name || req.file.originalname || 'upload').slice(0, 80)
    form.append('pinataMetadata', JSON.stringify({ name }))
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      form,
      { headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() }, maxBodyLength: Infinity }
    )

    const cid = data.IpfsHash
    res.json({ cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}` })
  } catch (err) {
    console.error('[pin-file] error', err?.response?.data || err.message)
    res.status(500).json({ error: 'Pinning failed', details: err?.response?.data || err.message })
  }
})

// Pin JSON (metadata)
app.post('/api/metadata', async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(500).json({ error: 'Server misconfigured: PINATA_JWT missing' })
    const payload = req.body || {}
    // Ensure shape: { name, description, imageCid }
    const meta = {
      name: String(payload.name || 'Untitled'),
      description: String(payload.description || ''),
      image: payload.imageCid ? `ipfs://${payload.imageCid}` : undefined,
    }
    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      meta,
      { headers: { Authorization: `Bearer ${PINATA_JWT}` } }
    )
    const cid = data.IpfsHash
    res.json({ metadata_cid: cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}` })
  } catch (err) {
    console.error('[metadata] error', err?.response?.data || err.message)
    res.status(500).json({ error: 'Pin JSON failed', details: err?.response?.data || err.message })
  }
})

// ---------------- Similarity / Hashing ----------------

// Compute perceptual hashes for a single file (used when saving)
app.post('/api/hashes', upload.single('file'), async (req, res) => {
  console.log('[hashes] hit', req.file?.originalname, req.file?.mimetype, req.file?.size)
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' })
    const buf = req.file.buffer
    const [dhash, sha] = await Promise.all([dhash64(buf), sha256Hex(buf)])
    res.json({ dhash64: dhash, sha256: sha })
  } catch (e) {
    console.error('[hashes] error', e)
    res.status(500).json({ error: 'hashing failed' })
  }
})

// Similarity search: compute pHash then compare to recent published artworks
app.post('/api/verify', upload.single('artwork'), async (req, res) => {
  console.log('[verify] hit', req.file?.originalname, req.file?.mimetype, req.file?.size)
  try {
    if (!req.file) return res.json({ similar: [] })

    const buf = req.file.buffer
    const upDhash = await dhash64(buf)

    if (!sb) return res.json({ similar: [] }) // not configured

    const { data, error } = await sb
      .from('artworks')
      .select('id, owner, title, cover_url, dhash64, created_at')
      .eq('status', 'published')
      .not('dhash64', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error

    const THRESH = 10
    const matches = (data || [])
      .map(row => ({ row, dist: hammingHex(upDhash, row.dhash64) }))
      .filter(x => x.dist <= THRESH)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12)
      .map(({ row, dist }) => ({
        id: row.id,
        user_id: row.owner,
        title: row.title || 'Untitled',
        username: '',
        image_url: row.cover_url,
        score: 1 - dist / 64
      }))

    const userIds = [...new Set(matches.map(m => m.user_id))].filter(Boolean)
    if (userIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, username').in('id', userIds)
      const lookup = new Map((profs || []).map(p => [p.id, p.username || '']))
      for (const m of matches) m.username = lookup.get(m.user_id) || ''
    }

    res.json({ similar: matches })
  } catch (e) {
    console.error('[verify] error', e)
    res.json({ similar: [] })
  }
})

app.listen(PORT, () => console.log(`API server listening on http://localhost:${PORT}`))
