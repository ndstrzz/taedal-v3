// src/lib/image.ts
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export async function blobFromCanvas(canvas: HTMLCanvasElement, type='image/jpeg', quality=0.92): Promise<Blob> {
  return await new Promise(res => canvas.toBlob(b => res(b!), type, quality)!)
}
