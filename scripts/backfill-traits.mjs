#!/usr/bin/env node
// scripts/backfill-traits.mjs
import { createClient } from '@supabase/supabase-js';

// Node 18+ has global fetch; no need for node-fetch

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function ipfsToHttp(u, gw = 'https://ipfs.io/ipfs/') {
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('ipfs://')) return gw + s.slice('ipfs://'.length);
  if (s.includes('gateway.pinata.cloud/ipfs/')) {
    return s.replace('https://gateway.pinata.cloud/ipfs/', gw);
  }
  return s;
}

async function run() {
  console.log('Backfilling traits…');
  // only published so you don’t write noise
  const { data: arts, error } = await sb
    .from('artworks')
    .select('id, metadata_url')
    .eq('status', 'published');

  if (error) throw error;
  if (!arts?.length) {
    console.log('No published artworks found. Done.');
    return;
  }

  let ok = 0, skipped = 0, failed = 0;

  for (const a of arts) {
    try {
      const url = ipfsToHttp(a.metadata_url);
      if (!url) { skipped++; continue; }

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { skipped++; continue; }

      const j = await res.json();
      const attrs = Array.isArray(j?.attributes) ? j.attributes : [];
      const rows = attrs
        .map(x => ({
          trait_type: x?.trait_type ?? x?.traitType ?? '',
          value: (x?.value ?? '').toString(),
        }))
        .filter(r => r.trait_type && r.value !== '');

      if (!rows.length) { skipped++; continue; }

      const payload = rows.map(r => ({
        artwork_id: a.id,
        trait_type: r.trait_type,
        value: r.value,
      }));

      // composite PK (artwork_id, trait_type, value) → upsert is idempotent
      const { error: upErr } = await sb
        .from('artwork_attributes')
        .upsert(payload, { onConflict: 'artwork_id,trait_type,value' });

      if (upErr) throw upErr;

      ok++;
      console.log(`✓ ${a.id} — upserted ${payload.length} trait(s)`);
    } catch (e) {
      failed++;
      console.warn(`× ${a.id} — ${e?.message || e}`);
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
