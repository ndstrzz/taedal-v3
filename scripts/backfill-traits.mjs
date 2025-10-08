#!/usr/bin/env node
/**
 * Backfill traits from token metadata into public.artwork_attributes.
 * - Loads env from ./server/.env automatically (Windows-friendly).
 * - Prefers SERVICE ROLE key, falls back to anon.
 * - Uses global fetch (Node 18+) and only falls back to node-fetch if missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env: root .env then server/.env
dotenv.config();
const serverEnvPath = path.resolve(__dirname, "../server/.env");
if (
  (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) &&
  fs.existsSync(serverEnvPath)
) {
  dotenv.config({ path: serverEnvPath });
}

// Fetch impl (global in Node >=18)
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  // Lazy fallback if someone runs this on very old Node
  const mod = await import("node-fetch");
  fetchFn = mod.default;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY)) {
  console.error(
    "✘ Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in your env"
  );
  process.exit(1);
}

const sb = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);

// IPFS -> HTTP
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
  console.log(
    "→ Backfill traits: using",
    SUPABASE_SERVICE_ROLE_KEY ? "SERVICE_ROLE" : "ANON",
    "key"
  );

  let insertedTotal = 0,
    skipped = 0,
    errored = 0;

  const { data: arts, error } = await sb
    .from("artworks")
    .select("id, metadata_url, status")
    .in("status", ["published", "draft"]);
  if (error) throw error;

  for (const a of arts || []) {
    try {
      const url = ipfsToHttp(a.metadata_url);
      if (!url) {
        skipped++;
        continue;
      }

      const res = await fetchFn(url);
      if (!res.ok) {
        skipped++;
        continue;
      }

      const j = await res.json();
      const attrs = Array.isArray(j.attributes) ? j.attributes : [];
      const rows = attrs
        .map((x) => ({
          trait_type: x.trait_type || x.traitType,
          value: x.value,
        }))
        .filter((r) => r.trait_type && String(r.value ?? "") !== "");

      if (!rows.length) {
        skipped++;
        continue;
      }

      const payload = rows.map((r) => ({
        artwork_id: a.id,
        trait_type: String(r.trait_type),
        value: String(r.value),
      }));

      const { error: upErr } = await sb
        .from("artwork_attributes")
        .upsert(payload, {
          onConflict: "artwork_id,trait_type,value",
          ignoreDuplicates: false,
        });
      if (upErr) throw upErr;

      insertedTotal += payload.length;
      console.log("✓ Backfilled", a.id, payload.length, "traits");
    } catch (e) {
      errored++;
      console.warn("! Skip", a.id, e.message || e);
    }
  }

  console.log(
    `Done. Inserted: ${insertedTotal}, skipped: ${skipped}, errored: ${errored}`
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
