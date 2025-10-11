// src/lib/ipfs-url.ts
/**
 * Robust IPFS helpers with multi-gateway fallback.
 */

const GATEWAYS = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://w3s.link/ipfs/",
  "https://ipfs.io/ipfs/",
];

function normalizeToPath(u: string) {
  if (!u) return "";
  const s = String(u);
  if (s.startsWith("ipfs://")) return s.slice("ipfs://".length);
  // convert https://<gw>/ipfs/<cidOrPath> → <cidOrPath>
  return s.replace(/^https?:\/\/[^/]+\/ipfs\//i, "");
}

export function ipfsCandidates(uri?: string | null) {
  if (!uri) return [] as string[];
  const path = normalizeToPath(uri);
  if (!path) return [];
  return GATEWAYS.map((gw) => gw + path);
}

/** For components that only accept a single URL (no fallback). */
export function ipfsToHttp(uri?: string | null) {
  const c = ipfsCandidates(uri);
  return c[0] || "";
}

export function isIpfsLike(u?: string | null) {
  if (!u) return false;
  return /^ipfs:\/\//i.test(u) || /\/ipfs\/[a-z0-9]/i.test(u);
}
