import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function source(relativePath: string): string {
  return readFileSync(join(webSrc, relativePath), "utf8");
}

const surfaces = [
  "app/api/admin/dashboard/route.ts",
  "app/api/admin/finance/summary/route.ts",
  "app/api/admin/reports/revenue/route.ts",
  "app/api/admin/gods-eye/route.ts",
  "app/api/admin/analytics/route.ts",
  "lib/admin/marketplace-health.ts",
];

describe("admin money surfaces share the ledger aggregator", () => {
  it.each(surfaces)("%s imports the shared aggregator and does not re-sum refunds or platform fees", (relativePath) => {
    const text = source(relativePath);
    expect(text).toContain("aggregate-finance-ledger-rows");
    expect(text).not.toMatch(/refunds_gross\s*=\s*[^;\n]*Math\.abs/);
    expect(text).not.toMatch(/service_fee_revenue\s*=\s*[^;\n]*reduce/);
  });

  it("revenue, analytics, and the dashboard call the canonical platform and gateway helpers", () => {
    for (const relativePath of [
      "app/api/admin/dashboard/route.ts",
      "app/api/admin/reports/revenue/route.ts",
      "app/api/admin/analytics/route.ts",
    ]) {
      const text = source(relativePath);
      expect(text).toContain("platformRevenueNetFromAggregate");
      expect(text).toContain("gatewayFeesTotalFromAggregate");
    }
    expect(source("app/api/admin/gods-eye/route.ts")).toContain("platformRevenueNetFromAggregate");
    expect(source("lib/admin/marketplace-health.ts")).toContain("platformRevenueNetFromAggregate");
    expect(source("lib/admin/marketplace-health.ts")).toContain("gatewayFeesTotalFromAggregate");
  });
});
