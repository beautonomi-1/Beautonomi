import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(__dirname, "AnalyticsPage.tsx"), "utf8");

describe("AnalyticsPage wiring", () => {
  it("uses URL period and renders users series", () => {
    expect(pageSource).toContain("useSearchParams");
    expect(pageSource).toContain("ts.users");
    expect(pageSource).toContain("userTrend");
  });

  it("labels scheduled day and provider net earnings", () => {
    expect(pageSource).toContain("Bookings by scheduled day");
    expect(pageSource).toContain("Top providers by net earnings");
    expect(pageSource).toContain("financeNote");
  });

  it("handles cohort loading via healthQ", () => {
    expect(pageSource).toContain("healthQ.isPending");
    expect(pageSource).toContain("AdminCohortTable");
  });

  it("links reports with period query", () => {
    expect(pageSource).toContain("?period=");
    expect(pageSource).toContain("/reports/bookings");
    expect(pageSource).toContain("/reports/revenue");
  });
});
