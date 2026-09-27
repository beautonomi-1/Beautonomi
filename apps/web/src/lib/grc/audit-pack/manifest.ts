import { createHash } from "node:crypto";

export type AuditPackManifest = {
  pack_id: string;
  label: string;
  generated_at: string;
  period: { start: string; end: string };
  redact_pii: boolean;
  soa_version: { id: string; label: string; approved_at: string | null } | null;
  activity_chain: { rows_checked: number; first_broken_id: number | null; last_hash: string | null } | null;
  /** Every file in the zip except manifest.json, with its SHA-256. */
  files: Record<string, { sha256: string; bytes: number }>;
  omitted_evidence: { evidence_id: string; reason: string }[];
};

export function sha256Bytes(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Kept for callers hashing text. */
export function hashContent(content: string): string {
  return sha256Bytes(content);
}

export function finalizeManifest(manifest: AuditPackManifest): { manifestJson: string; manifestHash: string } {
  const sorted = { ...manifest, files: Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))) };
  const manifestJson = JSON.stringify(sorted, null, 2);
  return { manifestJson, manifestHash: sha256Bytes(manifestJson) };
}
