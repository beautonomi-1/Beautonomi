import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTROLS, FRAMEWORKS, POLICY_TEMPLATES, REQUIREMENTS, VENDORS } from "./index";

const policiesDir = join(dirname(fileURLToPath(import.meta.url)), "../policies");
const byCategory = (fw: string, cat: string) => REQUIREMENTS.filter((r) => r.framework_id === fw && r.category === cat);

describe("framework catalogue", () => {
  it("has all 93 ISO/IEC 27001:2022 Annex A controls in the right themes", () => {
    const annex = byCategory("iso27001", "annex_a").map((r) => r.ref_code);
    expect(annex).toHaveLength(93);
    expect(annex.filter((r) => r.startsWith("A.5."))).toHaveLength(37);
    expect(annex.filter((r) => r.startsWith("A.6."))).toHaveLength(8);
    expect(annex.filter((r) => r.startsWith("A.7."))).toHaveLength(14);
    expect(annex.filter((r) => r.startsWith("A.8."))).toHaveLength(34);
  });

  it("has ISO clauses 4.1 to 10.2", () => {
    const clauses = byCategory("iso27001", "clause").map((r) => r.ref_code);
    expect(clauses[0]).toBe("4.1");
    expect(clauses.at(-1)).toBe("10.2");
    expect(clauses).toContain("6.1.3");
    expect(clauses).toContain("9.3");
  });

  it("has the 22 NIST CSF 2.0 categories", () => {
    expect(byCategory("nist_csf", "category")).toHaveLength(22);
  });

  it("has the eight POPIA conditions", () => {
    expect(byCategory("popia", "condition")).toHaveLength(8);
  });

  it("uses unique ids that belong to a known framework", () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fws = new Set(FRAMEWORKS.map((f) => f.id));
    for (const r of REQUIREMENTS) expect(fws.has(r.framework_id), r.id).toBe(true);
  });
});

describe("control set", () => {
  const reqIds = new Set(REQUIREMENTS.map((r) => r.id));
  const mapped = new Set(CONTROLS.flatMap((c) => c.requirement_ids));

  it("has unique ids and only references real requirements", () => {
    expect(new Set(CONTROLS.map((c) => c.id)).size).toBe(CONTROLS.length);
    for (const c of CONTROLS) {
      expect(c.requirement_ids.length, c.id).toBeGreaterThan(0);
      for (const r of c.requirement_ids) expect(reqIds.has(r), `${c.id} → ${r}`).toBe(true);
    }
  });

  it("maps every ISO clause, Annex A control, NIST category and POPIA condition to at least one control", () => {
    const mustMap = REQUIREMENTS.filter(
      (r) => r.framework_id !== "gdpr" && !(r.framework_id === "popia" && r.category === "section"),
    );
    const unmapped = mustMap.filter((r) => !mapped.has(r.id)).map((r) => r.id);
    expect(unmapped).toEqual([]);
  });

  it("gives every control an auditor note and example evidence", () => {
    for (const c of CONTROLS) {
      expect(c.auditor_note.length, c.id).toBeGreaterThan(20);
      expect(c.example_evidence.length, c.id).toBeGreaterThan(10);
    }
  });
});

describe("policy templates and inventories", () => {
  it("every template has a substantive markdown body", () => {
    for (const d of POLICY_TEMPLATES) {
      const path = join(policiesDir, d.file);
      expect(existsSync(path), d.file).toBe(true);
      const body = readFileSync(path, "utf8");
      expect(body.startsWith("# "), d.file).toBe(true);
      expect(body.length, d.file).toBeGreaterThan(800);
    }
    expect(new Set(POLICY_TEMPLATES.map((d) => d.slug)).size).toBe(POLICY_TEMPLATES.length);
  });

  it("vendor ids are unique slugs", () => {
    const ids = VENDORS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
