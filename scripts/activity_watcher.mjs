#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Contract, JsonRpcProvider } from 'ethers';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NFT_ADDRESS,
  RPC_URL,            // Alchemy/Infura/your node
  CHAIN_ID = '11155111'
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !NFT_ADDRESS || !RPC_URL) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NFT_ADDRESS, RPC_URL in .env');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const provider = new JsonRpcProvider(RPC_URL, Number(CHAIN_ID));

const ABI = [
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event ArtworkLinked(address indexed minter,uint256 indexed artworkId,uint256 indexed tokenId,string tokenURI)"
];
const c = new Contract(NFT_ADDRESS, ABI, provider);

async function upsertActivity(kind, tokenId, extra={}) {
  // Find artwork by token_id (string)
  const { data: rows, error } = await sb.from('artworks')
    .select('id')
    .eq('token_id', String(tokenId))
    .limit(1);
  if (error) { console.error('sb query error', error); return; }
  if (!rows?.length) return;

  const artwork_id = rows[0].id;
  await sb.from('activity').insert({
    artwork_id,
    kind,
    data: extra,
    // tx hash not available here; you can attach per-log if you fetch receipt
  });
}

async function main() {
  console.log('[watcher] listening…');

  c.on('Transfer', async (from, to, tokenId, ev) => {
    try {
      await upsertActivity('transfer', tokenId, { from, to, logIndex: ev.logIndex });
      console.log('[transfer]', tokenId.toString(), from, '→', to);
    } catch (e) {
      console.error('transfer ingest error', e);
    }
  });

  c.on('ArtworkLinked', async (minter, artworkId, tokenId, tokenURI, ev) => {
    try {
      await upsertActivity('mint', tokenId, { minter, artworkId: artworkId.toString(), tokenURI });
      console.log('[mint]', tokenId.toString(), 'by', minter);
    } catch (e) {
      console.error('mint ingest error', e);
    }
  });
}

main().catch(e => { console.error(e); process.exit(1); });
