import { API_BASE } from "./config";

export type PinResult = { cid: string; ipfsUri: string; gatewayUrl: string };

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function warmUpApi() {
  if (!API_BASE) throw new Error("API_BASE missing");
  const url = `${API_BASE.replace(/\/$/, "")}/api/health`;
  // two quick tries – helps with cold starts
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return;
    } catch {}
    await sleep(600);
  }
}

/** low-level XHR pin so we can report real upload progress */
function xhrPin(
  url: string,
  file: File | Blob,
  name: string,
  onProgress?: (ratio01: number) => void
): Promise<PinResult> {
  const fd = new FormData();
  const filename =
    (file as File).name ||
    name ||
    (file.type && file.type.startsWith("image/") ? "upload.webp" : "upload.bin");
  fd.append("file", file, filename);
  fd.append("name", name || filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (evt) => {
      if (onProgress && evt.lengthComputable) {
        onProgress(Math.min(1, evt.loaded / evt.total));
      }
    };
    xhr.onload = () => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`HTTP ${xhr.status} ${xhr.statusText} – ${xhr.responseText || ""}`));
        }
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error("Network/CORS error contacting API."));
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send(fd);
  });
}

/** Pins a file to IPFS via our server endpoint and reports progress (0..1). */
export async function pinFileViaServerWithProgress(
  file: File | Blob,
  name: string,
  onProgress?: (ratio01: number) => void
): Promise<PinResult> {
  if (!API_BASE) throw new Error("API_BASE missing");
  const url = `${API_BASE.replace(/\/$/, "")}/api/pinata/pin-file`;

  // Warm the API first
  try { await warmUpApi(); } catch {}

  // Show a tiny initial tick so the UI feels alive
  onProgress?.(0.05);

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = await xhrPin(url, file, name, onProgress);
      onProgress?.(1);
      return out;
    } catch (e: any) {
      // friendlier error for network/CORS
      const msg = String(e?.message || e);
      if (msg.includes("Network") || msg.includes("CORS")) {
        lastErr = new Error(
          "Network/CORS error contacting API. Check API_BASE and the server CORS allowlist."
        );
      } else {
        lastErr = e;
      }
      // small backoff and retry
      await sleep(800 * attempt);
    }
  }
  throw lastErr || new Error("Upload failed");
}
