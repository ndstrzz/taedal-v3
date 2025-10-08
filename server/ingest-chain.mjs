import 'dotenv/config';
import { WebSocketProvider, JsonRpcProvider, Contract } from 'ethers';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NFT_ADDRESS = process.env.NFT_ADDRESS;
const RPC_WS = process.env.RPC_WS || '';
const RPC_HTTP = process.env.RPC_HTTP || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !NFT_ADDRESS) {
  console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_KEY/NFT_ADDRESS');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const provider = RPC_WS
  ? new WebSocketProvider(RPC_WS)
  : new JsonRpcProvider(RPC_HTTP);

const abi = [
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event ArtworkLinked(address indexed minter,uint256 indexed artworkId,uint256 indexed tokenId,string tokenURI)"
];

const c = new Contract(NFT_ADDRESS, abi, provider);

c.on("Transfer", async (from, to, tokenId, ev) => {
  try {
    await sb.from('activity').insert({
      artwork_id: null, // unknown unless you store a mapping; optional to backfill later
      kind: 'transfer',
      tx_hash: ev.log.transactionHash,
      metadata: { from, to, tokenId: tokenId.toString() }
    });
    console.log('Transfer ->', tokenId.toString(), from, '->', to);
  } catch (e) {
    console.error('Insert transfer failed', e.message || e);
  }
});

c.on("ArtworkLinked", async (minter, artworkId, tokenId, tokenURI, ev) => {
  try {
    await sb.from('activity').insert({
      artwork_id: String(artworkId),
      kind: 'mint',
      tx_hash: ev.log.transactionHash,
      metadata_url: tokenURI,
      metadata: { minter, tokenId: tokenId.toString() }
    });
    console.log('Mint ->', artworkId.toString(), tokenId.toString());
  } catch (e) {
    console.error('Insert mint failed', e.message || e);
  }
});

console.log('Ingest is listening…');
