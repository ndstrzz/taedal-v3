#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role ONLY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function ipfsToHttp(uri) {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + uri.slice(7);
  if (uri.includes('gateway.pinata.cloud/ipfs/')) {
    return uri.replace('https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/');
  }
  return uri;
}

async function main() {
  console.log('[backfill] start');

  // get published artworks missing attributes
  const { data: rows, error } = await sb
    .from('artworks')
    .select('id, metadata_url')
    .eq('status', 'published');
  if (error) throw error;

  let added = 0;
  for (const row of rows) {
    const url = ipfsToHttp(row.metadata_url);
    if (!url) continue;
    try {
      const r = await fetch(url, { timeout: 15000 });
      if (!r.ok) { console.warn('bad metadata', row.id, r.status); continue; }
      const j = await r.json();
      const attrs = Array.isArray(j.attributes) ? j.attributes : [];
      const toInsert = attrs
        .map(a => ({
          artwork_id: row.id,
          trait_type: String(a.trait_type ?? '').trim(),
          value: String(a.value ?? '').trim(),
        }))
        .filter(a => a.trait_type && a.value);

      if (toInsert.length) {
        const { error: insErr } = await sb
          .from('artwork_attributes')
          .upsert(toInsert, { onConflict: 'artwork_id,trait_type,value' });
        if (insErr) console.error('upsert error', row.id, insErr);
        else added += toInsert.length;
      }
    } catch (e) {
      console.warn('fetch fail', row.id, e.message);
    }
  }
  console.log(`[backfill] done. inserted/updated ${added} trait rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
