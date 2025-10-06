import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { Area } from 'react-easy-crop'

type Props = {
  file: File
  /** 'avatar' => 1:1,  'cover' => 8:3 */
  mode: 'avatar' | 'cover'
  onCancel: () => void
  /** returns a high-quality, cropped JPEG blob */
  onConfirm: (blob: Blob) => void
}

/**
 * Modal with react-easy-crop.
 * Exports a crisp blob that matches the crop area (hidpi aware).
 */
export default function CropModal({ file, mode, onCancel, onConfirm }: Props) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [completedArea, setCompletedArea] = useState<Area | null>(null)
  const workingRef = useRef(false)

  const aspect = mode === 'avatar' ? 1 / 1 : 8 / 3
  // output target (CSS pixels)
  const target = mode === 'avatar'
    ? { w: 512, h: 512 }
    : { w: 1600, h: 600 }

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onCropComplete = (_: Area, cropped: Area) => setCompletedArea(cropped)

  async function handleConfirm() {
    if (!completedArea || workingRef.current) return
    workingRef.current = true
    try {
      const blob = await exportCroppedBlob(imageUrl, completedArea, target)
      onConfirm(blob)
    } finally {
      workingRef.current = false
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(92vw,900px)] max-h-[86vh] rounded-xl bg-elev1 p-4 ring-1 ring-border shadow-2xl">
        <div className="mb-3 text-h2">{mode === 'avatar' ? 'Crop avatar' : 'Crop cover'}</div>

        <div className="relative h-[60vh] w-full overflow-hidden rounded-lg bg-elev2 ring-1 ring-border">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              zoomWithScroll
              restrictPosition={false}
              showGrid={false}
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <input
            type="range"
            min={1}
            max={6}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-56"
          />
          <div className="flex gap-3">
            <button
              className="rounded-lg bg-elev2 px-4 py-2 text-sm ring-1 ring-border hover:bg-bg"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-brand/20 px-4 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
              onClick={handleConfirm}
            >
              Use crop
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Export a crisp JPEG blob that visually matches the crop.
 * - Renders at devicePixelRatio to avoid blur on hidpi screens,
 * - Downsamples to the target CSS size with high-quality smoothing.
 */
async function exportCroppedBlob(
  imageUrl: string,
  area: Area,
  target: { w: number; h: number }
): Promise<Blob> {
  const img = await loadImage(imageUrl)
  const dpr = Math.max(1, window.devicePixelRatio || 1)

  // 1) Render the cropped region onto an overscaled canvas (hidpi)
  const big = document.createElement('canvas')
  big.width = Math.round(target.w * dpr)
  big.height = Math.round(target.h * dpr)
  const bctx = big.getContext('2d')!
  bctx.imageSmoothingEnabled = true
  bctx.imageSmoothingQuality = 'high'
  bctx.fillStyle = '#000'
  bctx.fillRect(0, 0, big.width, big.height)

  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  const sx = area.x * scaleX
  const sy = area.y * scaleY
  const sW = area.width * scaleX
  const sH = area.height * scaleY

  bctx.drawImage(img, sx, sy, sW, sH, 0, 0, big.width, big.height)

  // 2) Downscale to CSS target for a crisp final bitmap
  let outCanvas = big
  if (dpr !== 1) {
    outCanvas = document.createElement('canvas')
    outCanvas.width = target.w
    outCanvas.height = target.h
    const octx = outCanvas.getContext('2d')!
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(big, 0, 0, outCanvas.width, outCanvas.height)
  }

  return new Promise<Blob>((resolve) =>
    outCanvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.92)
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
