#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

// Node 18+ has global fetch. If you’re on Node <18, uncomment next line:
// import fetch from "node-fetch";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ipfsToHttp = (u, gw = "https://ipfs.io/ipfs/") => {
  if (!u) return "";
  u = String(u);
  if (u.startsWith("ipfs://")) return gw + u.replace("ipfs://", "");
  if (u.includes("gateway.pinata.cloud/ipfs/")) {
    return u.replace("https://gateway.pinata.cloud/ipfs/", gw);
  }
  return u;
};

async function run() {
  const { data: arts, error } = await sb
    .from("artworks")
    .select("id, metadata_url, status")
    .eq("status", "published");
  if (error) throw error;

  for (const a of arts || []) {
    const url = ipfsToHttp(a.metadata_url);
    if (!url) continue;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("Skip", a.id, "metadata http", res.status);
        continue;
      }
      const j = await res.json();
      const attrs = Array.isArray(j?.attributes) ? j.attributes : [];
      const rows = attrs
        .map((x) => ({
          trait_type: x.trait_type || x.traitType,
          value: x.value,
        }))
        .filter((r) => r.trait_type && String(r.value ?? "") !== "");

      // clear then insert (avoids dupes if you re-run)
      await sb.from("artwork_attributes").delete().eq("artwork_id", a.id);

      if (!rows.length) {
        console.log("No traits for", a.id);
        continue;
      }

      const payload = rows.map((r) => ({
        artwork_id: a.id,
        trait_type: String(r.trait_type),
        value: String(r.value),
      }));

      const { error: upErr } = await sb.from("artwork_attributes").insert(payload);
      if (upErr) throw upErr;

      console.log("Backfilled", a.id, rows.length, "traits");
    } catch (e) {
      console.warn("Skip", a.id, e?.message || e);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
