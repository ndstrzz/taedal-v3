import { API_BASE } from "./config";

export type PinResult = { cid: string; ipfsUri: string; gatewayUrl: string };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function warmUpApi() {
  if (!API_BASE) throw new Error("API_BASE missing");
  const url = `${API_BASE.replace(/\/$/, "")}/api/health`;
  // two quick tries – helps with Render cold starts
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return;
    } catch {}
    await sleep(600);
  }
}

/** Pins a file to IPFS via our server endpoint and reports progress. */
export async function pinFileViaServerWithProgress(
  file: File,
  name: string,
  onProgress?: (ratio01: number) => void
): Promise<PinResult> {
  if (!API_BASE) throw new Error("API_BASE missing");

  // Warm the API first
  try { await warmUpApi(); } catch {}

  const url = `${API_BASE.replace(/\/$/, "")}/api/pinata/pin-file`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);

  // Coarse progress (true streaming isn’t available via fetch reliably)
  onProgress?.(0.05);

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` – ${body}` : ""}`);
      }
      const json = (await res.json()) as PinResult;
      onProgress?.(1);
      return json;
    } catch (e: any) {
      lastErr = e;
      // Surface a nice message for CORS / network layer issues
      if (
        String(e).includes("Failed to fetch") ||
        String(e.name).includes("TypeError")
      ) {
        lastErr = new Error("Network/CORS error contacting API. Check API_BASE and server CORS allowlist.");
      }
      await sleep(800);
    }
  }
  throw lastErr || new Error("Upload failed");
}
