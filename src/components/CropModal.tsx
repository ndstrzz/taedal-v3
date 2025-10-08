import React, { useEffect, useMemo, useState } from "react";
import Cropper, { Area } from "react-easy-crop";

/**
 * Props:
 *  - file: original image File
 *  - aspect: numeric aspect ratio (e.g., 1 for avatar, 5/2 for cover)
 *  - onCancel: close without saving
 *  - onDone: returns (blob, {width, height})
 */
type Props = {
  file: File;
  aspect: number;
  onCancel: () => void;
  onDone: (_cropped: Blob, _meta: { width: number; height: number }) => void | Promise<void>;
};

export default function CropModal({ file, aspect, onCancel, onDone }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  function onComplete(_: Area, croppedAreaPixels: Area) {
    setArea(croppedAreaPixels);
  }

  async function handleSave() {
    if (!area) return;
    setBusy(true);
    try {
      const { blob, width, height } = await cropToBlob(src, area, rotation);
      await onDone(blob, { width, height });
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        <div className="relative h-[60vh] w-full bg-neutral-900">
          <Cropper
            image={src}
            crop={crop}
            onCropChange={setCrop}
            zoom={zoom}
            onZoomChange={setZoom}
            rotation={rotation}
            onRotationChange={setRotation}
            aspect={aspect}
            onCropComplete={onComplete}
            restrictPosition
            objectFit="contain"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 p-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 text-neutral-400">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 text-neutral-400">Rotate</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </label>

          <div className="ml-auto flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              disabled={busy || !area}
            >
              {busy ? "Saving…" : "Save crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper: draw cropped region to a canvas and return a webp Blob + dimensions */
async function cropToBlob(
  imgSrc: string,
  area: Area,
  rotation = 0
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(imgSrc);

  // create canvas of the crop size
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // account for rotation by drawing to a temp canvas
  const safeW = Math.ceil(
    Math.abs(img.width * Math.cos(rad(rotation))) +
      Math.abs(img.height * Math.sin(rad(rotation)))
  );
  const safeH = Math.ceil(
    Math.abs(img.width * Math.sin(rad(rotation))) +
      Math.abs(img.height * Math.cos(rad(rotation)))
  );
  const tmp = document.createElement("canvas");
  tmp.width = safeW;
  tmp.height = safeH;
  const tctx = tmp.getContext("2d")!;
  tctx.translate(safeW / 2, safeH / 2);
  tctx.rotate(rad(rotation));
  tctx.drawImage(img, -img.width / 2, -img.height / 2);

  // crop from the rotated image
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  ctx.drawImage(
    tmp,
    Math.round(area.x + (safeW - img.width) / 2),
    Math.round(area.y + (safeH - img.height) / 2),
    Math.round(area.width),
    Math.round(area.height),
    0,
    0,
    Math.round(area.width),
    Math.round(area.height)
  );

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp", 0.95)
  );

  return { blob, width: canvas.width, height: canvas.height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = (e) => rej(e);
    img.src = src;
  });
}

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}
