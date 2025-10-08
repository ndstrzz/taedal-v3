export function ipfsToHttp(uri?: string | null, gw = "https://ipfs.io/ipfs/") {
  if (!uri) return "";
  const s = String(uri);
  if (s.startsWith("ipfs://")) return gw + s.replace("ipfs://", "");
  if (s.includes("gateway.pinata.cloud/ipfs/")) {
    return s.replace("https://gateway.pinata.cloud/ipfs/", gw);
  }
  return s;
}
