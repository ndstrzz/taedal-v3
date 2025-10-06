import { API_BASE } from './config'

export type PinResult = { cid: string; ipfsUri: string; gatewayUrl: string }

/** Simple pin (no progress) */
export async function pinFileViaServer(file: File, name?: string): Promise<PinResult> {
  const fd = new FormData()
  fd.append('file', file)
  if (name) fd.append('name', name)
  const res = await fetch(`${API_BASE}/api/pinata/pin-file`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Progress-aware pin using XHR (0–100) */
export function pinFileViaServerWithProgress(
  file: File,
  name: string | undefined,
  onProgress: (pct: number) => void
): Promise<PinResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', file)
    if (name) fd.append('name', name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/pinata/pin-file`)
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return
      const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)))
      onProgress(pct)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as PinResult)
      } else {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
}

/** Pin JSON metadata through the server */
export async function pinJSONViaServer(obj: any): Promise<PinResult> {
  const res = await fetch(`${API_BASE}/api/pinata/pin-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
