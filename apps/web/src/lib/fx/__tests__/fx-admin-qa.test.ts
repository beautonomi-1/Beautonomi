import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");

describe("FX admin route QA", () => {
  it("GET desk busts memo and returns last_ingest", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/app/api/admin/finance/fx-rates/route.ts"),
      "utf8",
    );
    expect(src).toContain("bustFxRateMemo()");
    expect(src).toContain("fetchLastIngestSummary");
    expect(src).toContain("last_ingest");
  });

  it("POST override audits all validation rejections", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/app/api/admin/finance/fx-rates/route.ts"),
      "utf8",
    );
    expect(src).toContain("auditOverrideRejected");
    expect(src).toContain("inactive_currency");
    expect(src).toContain("hold_until_invalid");
  });

  it("launch checklist links to fx-rates desk", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/regions/country-launch-checklist.ts"),
      "utf8",
    );
    expect(src).toContain('href: "/admin/fx-rates"');
  });

  it("extended API base is host-only in env example", () => {
    const env = readFileSync(join(repoRoot, "apps/web/.env.example"), "utf8");
    expect(env).toContain("FX_EXTENDED_API_BASE=https://open.er-api.com");
    expect(env).not.toContain("FX_EXTENDED_API_BASE=https://open.er-api.com/v6");
  });
});
