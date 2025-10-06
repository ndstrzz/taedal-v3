import { API_BASE } from "./config";

/** Pins a file to IPFS via our server endpoint and reports progress. */
export async function pinFileViaServerWithProgress(
  file: File,
  name: string,
  onProgress?: (ratio01: number) => void
): Promise<{ cid: string; ipfsUri: string; gatewayUrl: string }> {
  const url = `${API_BASE.replace(/\/$/, "")}/api/pinata/pin-file`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);

  const res = await new Promise<{ cid: string; ipfsUri: string; gatewayUrl: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) onProgress(evt.loaded / evt.total);
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) return reject(new Error(`Pin failed (${xhr.status})`));
      resolve(xhr.response);
    };
    xhr.send(fd);
  });

  if (onProgress) onProgress(1);
  return res;
}
