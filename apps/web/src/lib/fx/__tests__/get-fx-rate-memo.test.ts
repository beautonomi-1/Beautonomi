import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("getFxRate memo bust wiring", () => {
  it("ingest and admin GET call bustFxRateMemo", () => {
    const ingest = readFileSync(join(__dirname, "../ingest-reference-rates.ts"), "utf8");
    const adminGet = readFileSync(
      join(__dirname, "../../../app/api/admin/finance/fx-rates/route.ts"),
      "utf8",
    );
    expect(ingest).toContain("bustFxRateMemo()");
    expect(adminGet).toMatch(/GET[\s\S]*bustFxRateMemo\(\)/);
  });
});
