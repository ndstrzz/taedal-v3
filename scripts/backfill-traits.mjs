// scripts/backfill-traits.mjs
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ipfsToHttp = (uri) =>
  !uri ? '' :
  uri.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + uri.replace('ipfs://','') : uri;

async function run() {
  const { data: arts, error } = await sb
    .from('artworks')
    .select('id, owner, metadata_url')
    .eq('status','published')
    .order('created_at', { ascending: true });
  if (error) throw error;

  let inserted = 0;
  for (const a of (arts || [])) {
    if (!a.metadata_url) continue;

    // Check if already has attributes
    const { data: existing, error: e2 } = await sb
      .from('artwork_attributes')
      .select('artwork_id', { count: 'exact', head: true })
      .eq('artwork_id', a.id);
    if (e2) throw e2;
    if (existing && existing.length) continue;

    const url = ipfsToHttp(a.metadata_url);
    try {
      const res = await fetch(url, { timeout: 20000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();

      const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
      const rows = attrs
        .map(t => ({
          artwork_id: a.id,
          trait_type: String(t.trait_type ?? t.traitType ?? '').trim(),
          value: String(t.value ?? '').trim()
        }))
        .filter(r => r.trait_type && r.value);

      if (rows.length) {
        const { error: insErr } = await sb.from('artwork_attributes').insert(rows);
        if (insErr) throw insErr;
        inserted += rows.length;
        console.log(`+ ${a.id} (${rows.length} traits)`);
      }
      await sleep(250);
    } catch (e) {
      console.warn(`skip ${a.id}:`, e.message || e);
    }
  }
  console.log(`Done. Inserted ${inserted} trait rows.`);
}

run().catch(e => { console.error(e); process.exit(1); });
