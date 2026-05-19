/**
 * Client-side image compression + multipart upload helpers used by the
 * provider onboarding wizard (web).
 *
 * Why: §Provider-launch (2026-05) — embedding browser-picked photos as
 * `data:image/...` URLs inside the onboarding `formData` blew past Vercel's
 * ~4.5MB serverless function payload limit on `/api/provider/onboarding/draft`
 * and `/api/provider/onboarding`, surfacing as `413 FUNCTION_PAYLOAD_TOO_LARGE`
 * on "Submit & Launch". Uploading each image immediately to storage and
 * keeping only the resulting public URL in the wizard state keeps the draft
 * and the final POST tiny regardless of how many photos the provider picks.
 *
 * The flow mirrors what the React Native provider app already does: pick →
 * (optionally) compress on the client → multipart POST to `/api/upload` →
 * store the returned public URL.
 */

import { fetchJson } from "@/lib/http/fetcher";

const DEFAULT_MAX_DIMENSION = 2000;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_MIME = "image/jpeg";

export interface CompressImageOptions {
  /** Longest edge in pixels after downscale. Defaults to 2000. */
  maxDimension?: number;
  /** JPEG quality 0..1. Defaults to 0.85. */
  quality?: number;
  /** Output mime, defaults to image/jpeg. PNG/WebP also valid. */
  mimeType?: string;
}

/**
 * Downscale + re-encode an image File on the client so a hi-res phone capture
 * (10–20MB) becomes ≤ ~1MB before it leaves the browser. Falls back to the
 * original File when running in a non-browser environment, when the source
 * file already fits comfortably under the cap, or when canvas encoding fails.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }
  if (!file.type.startsWith("image/")) return file;
  // Skip animated GIFs — re-encoding strips frames.
  if (file.type === "image/gif") return file;

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? DEFAULT_MIME;

  try {
    const bitmap = await loadImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);

    // Already small enough and reasonably sized → ship the original to keep
    // EXIF + colorspace intact.
    if (longest <= maxDimension && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }

    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, quality),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${baseName || "image"}.${ext}`, { type: mimeType });
  } catch {
    // Any unexpected error → fall back to the original file. The server still
    // validates type + size, so a small original is fine.
    return file;
  }
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some browsers (older Safari) can't decode certain formats via
      // createImageBitmap → fall through to <img>.
    }
  }
  return loadViaImageElement(file);
}

function loadViaImageElement(file: File): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        // Wrap in a canvas/bitmap so the rest of the code can treat it uniformly.
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        if (typeof createImageBitmap === "function") {
          const bmp = await createImageBitmap(canvas);
          resolve(bmp);
        } else {
          // Synthesize a minimal ImageBitmap-like object from the canvas
          // (only width/height/close are needed by the caller).
          resolve({
            width: canvas.width,
            height: canvas.height,
            close: () => {},
          } as ImageBitmap);
        }
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export interface UploadOnboardingImageOptions {
  /** Storage folder for the upload (must match what `/api/upload` accepts). */
  folder?: string;
  /** Compression options forwarded to `compressImageFile`. */
  compress?: CompressImageOptions;
  /** Override the upload endpoint (for testing / future per-app routes). */
  endpoint?: string;
}

/**
 * Compress (best-effort) and upload a single image via `/api/upload`. Returns
 * the public URL stored against the onboarding draft + final submit so the
 * wizard never sends base64 payloads.
 */
export async function compressAndUploadOnboardingImage(
  file: File,
  options: UploadOnboardingImageOptions = {},
): Promise<string> {
  const compressed = await compressImageFile(file, options.compress);
  const formData = new FormData();
  formData.append("file", compressed, compressed.name);
  formData.append("folder", options.folder ?? "provider-onboarding");

  const endpoint = options.endpoint ?? "/api/upload";
  const result = await fetchJson<{ data?: { url?: string; path?: string } | null }>(endpoint, {
    method: "POST",
    body: formData,
    timeoutMs: 60_000,
  });
  const url = result?.data?.url;
  if (!url || typeof url !== "string") {
    throw new Error("Upload succeeded but no URL was returned");
  }
  return url;
}

/**
 * Defensive helper used by `saveDraft` and the final submit to make sure no
 * residual `data:` URL (e.g. from a previously cached wizard session) is sent
 * to the server, which would trigger another 413.
 */
export function stripDataUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:")) return undefined;
  return trimmed;
}

export function stripDataUrlsFromArray(values: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => stripDataUrl(v))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** True when the value still references an inline base64 payload. */
export function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().startsWith("data:");
}
