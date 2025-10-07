// src/lib/video.ts
export async function capturePosterFromVideo(file: File): Promise<Blob> {
  if (!file.type.startsWith("video/")) throw new Error("Not a video file");

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((res, rej) => {
      const onLoaded = () => res();
      const onErr = () => rej(new Error("Failed to load video"));
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    // Seek ~10% in to avoid black first frame
    const target = Math.min(Math.max(video.duration * 0.1, 0), video.duration - 0.05);
    await new Promise<void>((res) => {
      const done = () => res();
      video.currentTime = target;
      video.addEventListener("seeked", done, { once: true });
    });

    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b || new Blob()), "image/webp", 0.92)
    );
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
