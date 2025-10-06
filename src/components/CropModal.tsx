// src/components/CropModal.tsx
import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  file: File
  aspect: number            // width / height (e.g., 1 for avatar, 2.5 for wide cover)
  maxOutput: number         // max output width in px (height derived by aspect)
  title?: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export default function CropModal({ file, aspect, maxOutput, title, onCancel, onConfirm }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState(1) // 1–3
  const [natural, setNatural] = useState<{w:number;h:number} | null>(null)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
  }

  async function doConfirm() {
    if (!imgRef.current || !natural) return
    const { w: iw, h: ih } = natural

    // Determine output w/h based on desired maxOutput & aspect
    const outW = maxOutput
    const outH = Math.round(outW / aspect)

    // We scale the image so that the smaller side of the crop is filled,
    // then center-crop.
    const scaleBase = Math.max(outW / iw, outH / ih) * zoom

    const drawW = iw * scaleBase
    const drawH = ih * scaleBase

    // Center position (draw image so that it covers the canvas)
    const dx = (outW - drawW) / 2
    const dy = (outH - drawH) / 2

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, outW, outH)
    ctx.drawImage(imgRef.current, dx, dy, drawW, drawH)

    const blob: Blob = await new Promise((res) => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92)!)
    onConfirm(blob)
  }

  return (
    <div className="fixed inset-0 z-[999] grid place-items-center bg-black/60">
      <div className="w-[92vw] max-w-2xl rounded-xl bg-elev1 p-4 ring-1 ring-border">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-h3">{title || 'Crop image'}</div>
          <button onClick={onCancel} className="text-subtle hover:text-text text-sm">Cancel</button>
        </div>

        <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev2 grid place-items-center">
          {/* We simply center the image and scale with zoom */}
          <img
            ref={imgRef}
            src={url}
            onLoad={handleImgLoad}
            alt="to-crop"
            style={{
              maxWidth: 'none',
              transform: `scale(${zoom})`,
            }}
            className="pointer-events-none select-none"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-subtle">Zoom</label>
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

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg bg-elev2 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-bg">
            Cancel
          </button>
          <button
            onClick={doConfirm}
            className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
          >
            Use image
          </button>
        </div>
      </div>
    </div>
  )
}
