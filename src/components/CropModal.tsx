import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

type Props = {
  file: File
  /** 'avatar' uses 1:1, 'cover' uses 5:2 by default; user can also switch ratios or freeform. */
  mode: 'avatar' | 'cover'
  onCancel: () => void
  onConfirm: (blob: Blob) => void
  /** clamp output width (height derived from crop). Defaults: avatar=512, cover=1600 */
  maxOutputWidth?: number
}

export default function CropModal({ file, mode, onCancel, onConfirm, maxOutputWidth }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [completed, setCompleted] = useState<PixelCrop | null>(null)

  const defaultAspect = mode === 'avatar' ? 1 : 5 / 2
  const [aspect, setAspect] = useState<number | undefined>(defaultAspect) // undefined = freeform
  const maxW = maxOutputWidth ?? (mode === 'avatar' ? 512 : 1600)

  const [crop, setCrop] = useState<Crop>(() => ({
    unit: '%',
    x: 5, y: 5,
    width: 90,
    height: mode === 'avatar' ? 90 : 36, // approx 5:2 visual start
  }))

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  function onImageLoaded(img: HTMLImageElement) {
    imgRef.current = img
  }

  async function confirm() {
    if (!imgRef.current || !completed) return

    // pixelCrop is relative to the displayed image size (no CSS scale here)
    const img = imgRef.current
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    const sx = Math.max(0, Math.floor(completed.x * scaleX))
    const sy = Math.max(0, Math.floor(completed.y * scaleY))
    const sw = Math.max(1, Math.floor(completed.width * scaleX))
    const sh = Math.max(1, Math.floor(completed.height * scaleY))

    // target output size (clamp to max width to keep files reasonable)
    let outW = sw
    let outH = sh
    if (outW > maxW) {
      const k = maxW / outW
      outW = Math.round(outW * k)
      outH = Math.round(outH * k)
    }

    // Retina-sharp canvas
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(outW * dpr))
    canvas.height = Math.max(1, Math.round(outH * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    ctx.scale(dpr, dpr)

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), 'image/jpeg', 0.92)
    )
    onConfirm(blob)
  }

  return (
    <div className="fixed inset-0 z-[999] grid place-items-center bg-black/60">
      <div className="w-[92vw] max-w-3xl rounded-xl bg-elev1 p-4 ring-1 ring-border">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-h3">{mode === 'avatar' ? 'Edit avatar' : 'Edit cover'}</div>
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
                draggable={false}
                className="select-none"
                style={{ maxWidth: '100%', height: 'auto' }}
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
