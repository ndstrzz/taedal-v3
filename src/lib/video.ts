// src/lib/video.ts
// Capture a video frame and return a high-quality WEBP Blob.
// Picks the midpoint of the video when possible; falls back to 0.5s.
export async function capturePosterFromVideo(file: File): Promise<Blob> {
  if (!file || !file.type.startsWith("video/")) {
    throw new Error("Expected a video file");
  }

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";

    // Wait for metadata to know dimensions/duration
    await once(video, "loadedmetadata");

    // Choose capture time (midpoint or 0.5s if super short)
    let t = Math.max(0.5, (video.duration || 1) / 2);
    // Seek and wait
    await seekTo(video, t);

    // Draw to canvas
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Encode to WEBP
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/webp",
        0.95
      )
    );

    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLMediaElement, event: string) {
  return new Promise<void>((res, rej) => {
    const onErr = () => {
      cleanup();
      rej(new Error("video error"));
    };
    const onOk = () => {
      cleanup();
      res();
    };
    function cleanup() {
      el.removeEventListener(event, onOk);
      el.removeEventListener("error", onErr);
    }
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}

function seekTo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((res, rej) => {
    const onSeeked = () => {
      cleanup();
      res();
    };
    const onErr = () => {
      cleanup();
      rej(new Error("seek failed"));
    };
    function cleanup() {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
    }
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    try {
      video.currentTime = time;
    } catch {
      // Some browsers require play/pause once before seeking
      video.play().then(() => {
        video.pause();
        video.currentTime = time;
      }).catch(() => onErr());
    }
  });
}
