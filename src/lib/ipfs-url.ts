// src/lib/ipfs-url.ts
const GATEWAY = "https://ipfs.io/ipfs/"; // or your preferred public gateway

function isHttp(u: string) {
  return /^https?:\/\//i.test(u);
}

function stripIpfs(u: string) {
  // ipfs://CID or ipfs://ipfs/CID
  const m1 = u.match(/^ipfs:\/\/(?:(?:ipfs)\/)?([^/?#]+)(.*)$/i);
  if (m1) return m1[1] + (m1[2] || "");
  // /ipfs/CID
  const m2 = u.match(/^\/?ipfs\/([^/?#]+)(.*)$/i);
  if (m2) return m2[1] + (m2[2] || "");
  // raw CID case – if it looks like a CID, pass through
  if (/^[a-z0-9]{46,}|^baf[mk]/i.test(u)) return u;
  return "";
}

/** Convert many IPFS-ish forms to a gateway URL. Passthrough for http(s). */
export function ipfsToHttp(u: string | null | undefined): string {
  if (!u) return "";
  const s = String(u).trim();
  if (!s) return "";
  if (isHttp(s)) return s;

  const cidAndRest = stripIpfs(s);
  if (cidAndRest) return GATEWAY + cidAndRest.replace(/^\/+/, "");

  return s; // as a last resort, return unchanged
}
