import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/grc/activity", () => ({ writeGrcActivity: vi.fn() }));

import { normaliseSeverity, parseCsv, parseFindings } from "@/lib/grc/findings-import";
import { evidenceDueAt, evidenceIsCurrent } from "@/lib/grc/cadence";
import { evidenceObjectPath } from "@/lib/grc/evidence";
import { csv, makeRedactor } from "@/lib/grc/audit-pack/builder";
import { GRC_COLLECTORS, collectorIsDue } from "@/lib/grc/collectors";

const DAY = 86_400_000;

describe("findings import", () => {
  it("parses RFC 4180 CSV with quotes, escaped quotes and embedded newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nthen left"\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"\nthen left']]);
  });

  it("normalises severities from words, priorities and CVSS scores", () => {
    expect(normaliseSeverity("Critical")).toBe("critical");
    expect(normaliseSeverity("P1")).toBe("high");
    expect(normaliseSeverity("moderate")).toBe("medium");
    expect(normaliseSeverity("9.8")).toBe("critical");
    expect(normaliseSeverity("5.3")).toBe("medium");
    expect(normaliseSeverity("Informational")).toBe("info");
    expect(normaliseSeverity("banana")).toBeNull();
  });

  it("maps flexible column names and rejects bad rows without failing the file", () => {
    const r = parseFindings("csv", "Finding ID,Vulnerability,Risk Rating,Host\nPT-1,SQLi,High,api\nPT-2,,Low,web\nPT-3,XSS,weird,web\n");
    expect(r.rows).toEqual([{ external_ref: "PT-1", title: "SQLi", severity: "high", description: "Affected: api" }]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it("derives a stable reference when the report has none, and flags duplicates", () => {
    const a = parseFindings("json", JSON.stringify([{ title: "Weak TLS", severity: "medium" }, { title: "Weak TLS", severity: "medium" }]));
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].external_ref).toMatch(/^sha:[0-9a-f]{16}$/);
    expect(a.errors[0].message).toMatch(/Duplicate/);
    const b = parseFindings("json", JSON.stringify({ findings: [{ title: "Weak TLS", severity: "medium" }] }));
    expect(b.rows[0].external_ref).toBe(a.rows[0].external_ref);
  });

  it("reports invalid JSON instead of throwing", () => {
    expect(parseFindings("json", "{").errors[0].message).toMatch(/JSON/);
  });
});

describe("evidence cadence", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  it("treats missing evidence as not current and due now", () => {
    expect(evidenceIsCurrent("quarterly", null, now)).toBe(false);
    expect(evidenceDueAt("quarterly", null, now).getTime()).toBe(now);
  });
  it("applies the cadence window with grace", () => {
    expect(evidenceIsCurrent("monthly", new Date(now - 30 * DAY).toISOString(), now)).toBe(true);
    expect(evidenceIsCurrent("monthly", new Date(now - 40 * DAY).toISOString(), now)).toBe(false);
    expect(evidenceIsCurrent(null, new Date(now - 300 * DAY).toISOString(), now)).toBe(true);
  });
});

describe("evidence storage paths", () => {
  it("always lives under evidence/ so storage policies apply", () => {
    const sha = "a".repeat(64);
    expect(evidenceObjectPath("A.5.1", sha)).toBe(`evidence/A_5_1/${sha}`);
    expect(evidenceObjectPath("../../audit-packs", sha).startsWith("evidence/")).toBe(true);
    expect(evidenceObjectPath("../../audit-packs", sha)).not.toContain("..");
  });
});

describe("audit pack helpers", () => {
  it("escapes CSV cells", () => {
    expect(csv([{ a: 'x,"y"', b: null, c: { k: 1 } }])).toBe('a,b,c\n"x,""y""",,"{""k"":1}"\n');
  });

  it("pseudonymises people consistently and redacts PII only when enabled", () => {
    const on = makeRedactor("pack-1", true);
    const row = on.redactRow({ owner_user_id: "u1", submitted_by: "u1", subject_email: "a@b.c", title: "keep" });
    expect(row.owner_user_id).toMatch(/^person-[0-9a-f]{10}$/);
    expect(row.owner_user_id).toBe(row.submitted_by);
    expect(row.subject_email).toBe("[redacted]");
    expect(row.title).toBe("keep");
    expect(makeRedactor("pack-2", true).redactRow({ owner_user_id: "u1" }).owner_user_id).not.toBe(row.owner_user_id);
    expect(makeRedactor("pack-1", false).redactRow({ subject_email: "a@b.c" }).subject_email).toBe("a@b.c");
  });
});

describe("collectors", () => {
  it("every catalogue collector_key has an implementation and vice versa", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../../../../packages/grc-catalog/src/controls.ts"), "utf8");
    const catalogue = Array.from(new Set(Array.from(src.matchAll(/collector:\s*"([a-z0-9-]+)"/g)).map((m) => m[1]))).sort();
    const implemented = GRC_COLLECTORS.map((c) => c.key).sort();
    expect(catalogue.length).toBeGreaterThan(0);
    expect(implemented).toEqual(catalogue);
    expect(new Set(implemented).size).toBe(implemented.length);
  });

  it("runs weekly collectors on Mondays (UTC) only", () => {
    const weekly = GRC_COLLECTORS.find((c) => c.schedule === "weekly")!;
    const daily = GRC_COLLECTORS.find((c) => c.schedule === "daily")!;
    expect(collectorIsDue(weekly, new Date("2026-06-01T06:30:00Z"))).toBe(true);
    expect(collectorIsDue(weekly, new Date("2026-06-02T06:30:00Z"))).toBe(false);
    expect(collectorIsDue(daily, new Date("2026-06-02T06:30:00Z"))).toBe(true);
  });
});
