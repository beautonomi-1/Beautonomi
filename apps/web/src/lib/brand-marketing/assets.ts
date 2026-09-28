import { createHash } from "node:crypto";

export const BRAND_ASSETS_BUCKET = "brand-assets";

export const BRAND_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
] as const;

export const BRAND_ASSET_MAX_BYTES = 50 * 1024 * 1024;

export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function brandAssetObjectPath(tenantId: string, assetId: string, sha256: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return `${tenantId}/${assetId}/${sha256}.${safeExt}`;
}

export function mimeToExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  if (mime === "video/mp4") return "mp4";
  return "bin";
}
