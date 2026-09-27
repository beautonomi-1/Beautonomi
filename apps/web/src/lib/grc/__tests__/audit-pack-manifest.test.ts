import { describe, expect, it } from "vitest";
import { finalizeManifest, sha256Bytes, type AuditPackManifest } from "@/lib/grc/audit-pack/manifest";

function manifest(files: AuditPackManifest["files"]): AuditPackManifest {
  return {
    pack_id: "00000000-0000-0000-0000-000000000001",
    label: "Test pack",
    generated_at: "2026-01-01T00:00:00.000Z",
    period: { start: "2025-01-01", end: "2025-12-31" },
    redact_pii: true,
    soa_version: null,
    activity_chain: { rows_checked: 3, first_broken_id: null, last_hash: "abc" },
    files,
    omitted_evidence: [],
  };
}

describe("audit pack manifest", () => {
  it("produces a stable 64-char sha256", () => {
    const m = manifest({ "controls.csv": { sha256: sha256Bytes("id\n"), bytes: 3 } });
    const a = finalizeManifest(m);
    expect(a.manifestHash).toBe(finalizeManifest(m).manifestHash);
    expect(a.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.manifestHash).toBe(sha256Bytes(a.manifestJson));
  });

  it("is independent of file insertion order", () => {
    const x = { sha256: sha256Bytes("x"), bytes: 1 };
    const y = { sha256: sha256Bytes("y"), bytes: 1 };
    expect(finalizeManifest(manifest({ "b.csv": y, "a.csv": x })).manifestHash).toBe(finalizeManifest(manifest({ "a.csv": x, "b.csv": y })).manifestHash);
  });

  it("changes when any file hash changes", () => {
    const a = finalizeManifest(manifest({ "a.csv": { sha256: sha256Bytes("x"), bytes: 1 } }));
    const b = finalizeManifest(manifest({ "a.csv": { sha256: sha256Bytes("z"), bytes: 1 } }));
    expect(a.manifestHash).not.toBe(b.manifestHash);
  });
});
