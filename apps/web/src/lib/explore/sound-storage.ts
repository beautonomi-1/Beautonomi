import { MAX_SOUND_BYTES } from "@/lib/explore/explore-feature-gates";

export const EXPLORE_PLATFORM_SOUND_PREFIX = "explore/platform/";

const ALLOWED_SOUND_MIMES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
]);

export function isAllowedExploreSoundMime(mime: string | null | undefined): boolean {
  if (!mime?.trim()) return false;
  return ALLOWED_SOUND_MIMES.has(mime.trim().toLowerCase());
}

export function exploreSoundExtensionFromMime(mime: string | null | undefined): "mp3" | "m4a" {
  const m = (mime ?? "").toLowerCase();
  if (m === "audio/mpeg") return "mp3";
  return "m4a";
}

export function platformSoundObjectPath(mime: string): string {
  const ext = exploreSoundExtensionFromMime(mime);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `${EXPLORE_PLATFORM_SOUND_PREFIX}sound-${stamp}-${rand}.${ext}`;
}

export function assertExploreSoundSizeBytes(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "Invalid file size";
  if (sizeBytes > MAX_SOUND_BYTES) return "Sound file is too large";
  return null;
}

export function titleFromSoundFilename(filename: string | null | undefined): string {
  const base = (filename ?? "Sound").replace(/\.[^.]+$/, "").trim();
  const cleaned = base.replace(/[-_]+/g, " ").trim();
  return (cleaned || "Sound").slice(0, 120);
}
