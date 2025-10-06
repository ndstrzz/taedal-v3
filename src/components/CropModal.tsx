// src/components/CropModal.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

type Props = {
  file: File
  /** "avatar" defaults to 1:1, "cover" defaults to 5:2 (wide). User can switch to freeform. */
  mode: 'avatar' | 'cover'
  /** Called when user cancels */
  onCancel: () => void
  /** Called with the cropped image Blob (JPEG). */
  onConfirm: (blob: Blob) => void
  /**
   * Optional: max output width in px (height is derived by aspect when locked; otherwise based on crop box).
   * Defaults: avatar 512, cover 1600.
   */
  maxOutputWidth?: number
}

export default function CropModal({ file, mode, onCancel, onConfirm, maxOutputWidth }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  // crop state
  const [crop, setCrop] = useState<Crop>(() => ({
    unit: '%',
    x: 5,
    y: 5,
    width: mode === 'avatar' ? 90 : 90,
    height: mode === 'avatar' ? 90 : 36, // approx 5:2
  }))
  const [completed, setCompleted] = useState<PixelCrop | null>(null)

  // aspect control: locked or freeform
  const defaultAspect = mode === 'avatar' ? 1 / 1 : 5 / 2
  const [aspect, setAspect] = useState<number | undefined>(defaultAspect) // undefined = freeform

  // zoom/rotate (optional; rotate omitted for simplicity)
  const [zoom, setZoom] = useState(1) // scale applied at render/export time

  const maxW = maxOutputWidth ?? (mode === 'avatar' ? 512 : 1600)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  function onImageLoaded(img: HTMLImageElement) {
    imgRef.current = img
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
  }

  async function confirm() {
    if (!imgRef.current || !completed || !natural) return

    // Compute output size. For locked aspect, ensure width respects maxW.
    // For freeform, scale crop box so the output width <= maxW.
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height

    const cropW = Math.max(1, Math.round(completed.width * scaleX))
    const cropH = Math.max(1, Math.round(completed.height * scaleY))

    let outW = cropW
    let outH = cropH

    if (aspect) {
      // lock height to the aspect
      outW = Math.min(maxW, cropW)
      outH = Math.round(outW / aspect)
    } else {
      // freeform: clamp width to max
      if (outW > maxW) {
        const s = maxW / outW
        outW = Math.round(outW * s)
        outH = Math.round(outH * s)
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, outW)
    canvas.height = Math.max(1, outH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High quality
    ctx.imageSmoothingQuality = 'high'

    // Source rect (on the original image in natural pixels)
    const sx = Math.max(0, Math.floor(completed.x * scaleX))
    const sy = Math.max(0, Math.floor(completed.y * scaleY))
    const sw = cropW
    const sh = cropH

    // Draw scaled into the output canvas (apply zoom)
    // Zoom > 1 means we virtually crop a smaller area to scale up.
    // To keep UX simple, we just scale destination draw.
    const dx = 0
    const dy = 0
    const dw = Math.round(outW * zoom)
    const dh = Math.round(outH * zoom)

    // Center the zoomed draw in the canvas
    const cx = Math.round((canvas.width - dw) / 2)
    const cy = Math.round((canvas.height - dh) / 2)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, cx, cy, dw, dh)

    const blob: Blob = await new Promise((res) => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92)!)
    onConfirm(blob)
  }

  return (
    <div className="fixed inset-0 z-[999] grid place-items-center bg-black/60">
      <div className="w-[92vw] max-w-3xl rounded-xl bg-elev1 p-4 ring-1 ring-border">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-h3">
            {mode === 'avatar' ? 'Edit avatar' : 'Edit cover'}
          </div>
          <button onClick={onCancel} className="text-subtle hover:text-text text-sm">Cancel</button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <div className="rounded-lg ring-1 ring-border bg-elev2 p-2">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(_c, px) => setCompleted(px)}
              aspect={aspect}
              keepSelection
              minWidth={20}
              minHeight={20}
              className="max-h-[60vh]"
            >
              <img
                src={url}
                onLoad={(e) => onImageLoaded(e.currentTarget)}
                alt="to-crop"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              />
            </ReactCrop>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm text-subtle">Aspect</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${aspect === undefined ? 'bg-elev2 ring-border' : 'bg-elev1 ring-border hover:bg-bg'}`}
                  onClick={() => setAspect(undefined)}
                >
                  Freeform
                </button>
                <button
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${aspect === 1 ? 'bg-elev2 ring-border' : 'bg-elev1 ring-border hover:bg-bg'}`}
                  onClick={() => setAspect(1)}
                >
                  1:1
                </button>
                <button
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${aspect === 5/2 ? 'bg-elev2 ring-border' : 'bg-elev1 ring-border hover:bg-bg'}`}
                  onClick={() => setAspect(5/2)}
                >
                  5:2
                </button>
                <button
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${aspect === 16/9 ? 'bg-elev2 ring-border' : 'bg-elev1 ring-border hover:bg-bg'}`}
                  onClick={() => setAspect(16/9)}
                >
                  16:9
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm text-subtle">Zoom</div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={confirm}
                className="w-full rounded-lg bg-brand/20 px-3 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
              >
                Use image
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
