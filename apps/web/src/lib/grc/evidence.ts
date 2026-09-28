import { createHash } from "node:crypto";

export const GRC_EVIDENCE_BUCKET = "grc-evidence";

/** Must stay within the bucket's allowed_mime_types (migration 959) and file_size_limit (955). */
export const GRC_EVIDENCE_MIME_TYPES = [
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const GRC_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;

export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Content-addressed: the same bytes for the same control always land at the same path. */
export function evidenceObjectPath(scope: string, sha256: string): string {
  const safeScope = scope.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "unscoped";
  return `evidence/${safeScope}/${sha256}`;
}
