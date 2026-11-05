const FRAME_WAIT_MS = 4000;

/** True when the element is not already on the requested frame. Setting currentTime to the same value often never fires `seeked`. */
export function videoNeedsSeek(currentSec: number, targetSec: number): boolean {
  return Math.abs(currentSec - targetSec) > 0.05;
}

function waitForVideoEvent(video: HTMLVideoElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(event === "loadeddata" ? "video_load_failed" : "video_seek_failed"));
    }, FRAME_WAIT_MS);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(event === "loadeddata" ? "video_load_failed" : "video_seek_failed"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener(event, onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

/** Capture one JPEG frame from a local video File at `timeMs` (same-origin blob URL). */
export async function captureVideoFrameJpeg(
  file: File,
  timeMs: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await waitForVideoEvent(video, "loadeddata");

    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : timeMs;
    const seekMs = Math.max(0, Math.min(timeMs, Math.max(0, durationMs - 50)));
    const targetSec = seekMs / 1000;
    if (videoNeedsSeek(video.currentTime || 0, targetSec)) {
      const seeked = waitForVideoEvent(video, "seeked");
      video.currentTime = targetSec;
      await seeked;
    }

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("jpeg_encode_failed"))),
        "image/jpeg",
        0.85,
      );
    });

    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
