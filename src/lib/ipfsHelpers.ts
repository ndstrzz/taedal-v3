// src/lib/ipfsHelpers.ts
export function toGateway(u?: string | null) {
  if (!u) return "";
  // ipfs://<cid> or ipfs://<cid>/<path>
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice(7)}`;
  // bare CID
  if (/^[A-Za-z0-9]{46,}$/.test(u)) return `https://ipfs.io/ipfs/${u}`;
  return u; // already http(s)
}
