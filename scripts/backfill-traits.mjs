// scripts/backfill-traits.mjs
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../server/.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or key in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ipfsToHttp(uri, gw = "https://ipfs.io/ipfs/") {
  if (!uri) return "";
  const s = String(uri);
  if (s.startsWith("ipfs://")) return gw + s.slice(7);
  if (s.includes("gateway.pinata.cloud/ipfs/")) {
    return s.replace("https://gateway.pinata.cloud/ipfs/", gw);
  }
  return s;
}

async function fetchJson(url) {
  const r = await fetch(url, { redirect: "follow" }); // ← Node 20 global fetch
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  console.log("Fetching published artworks…");
  const { data: arts, error: artErr } = await sb
    .from("artworks")
    .select("id, metadata_url, status")
    .eq("status", "published");

  if (artErr) throw artErr;

  let ok = 0,
    fail = 0,
    skipped = 0;

  for (const a of arts) {
    try {
      const metaUrl = ipfsToHttp(a.metadata_url);
      if (!metaUrl) {
        skipped++;
        continue;
      }

      const meta = await fetchJson(metaUrl);
      const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];

      const rows = attrs
        .map((t) => ({
          artwork_id: a.id,
          trait_type: String(t.trait_type ?? "").trim(),
          value: String(t.value ?? "").trim(),
        }))
        .filter((r) => r.trait_type && r.value);

      // wipe then insert (simple backfill approach)
      await sb.from("artwork_attributes").delete().eq("artwork_id", a.id);
      if (rows.length) {
        const { error } = await sb.from("artwork_attributes").insert(rows);
        if (error) throw error;
      }

      process.stdout.write(".");
      ok++;
    } catch (e) {
      console.error(`\n[${a.id}] backfill failed:`, e.message || e);
      fail++;
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail} skipped=${skipped}`);

  // refresh the MV (works because function is SECURITY DEFINER)
  const { error: refreshErr } = await sb.rpc("refresh_trait_stats_mv");
  if (refreshErr) {
    console.warn(
      "refresh_trait_stats_mv failed (safe to ignore while testing):",
      refreshErr.message
    );
  } else {
    console.log("Refreshed trait_stats_mv.");
  }
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exit(1);
});
