import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(__dirname, "ReportDetailPage.tsx"), "utf8");

describe("ReportDetailPage CSV export", () => {
  it("does not fall back to analytics export for unknown keys", () => {
    expect(pageSource).not.toContain('?? "/api/admin/export/analytics"');
    expect(pageSource).toContain("REPORTS_WITHOUT_CSV");
  });

  it("labels revenue export as summary CSV", () => {
    expect(pageSource).toContain("Download summary CSV");
    expect(pageSource).toContain('new URLSearchParams({ period, report_type: "revenue" })');
  });

  it("links superadmin to analytics with period", () => {
    expect(pageSource).toContain("ANALYTICS_DRILLUP_KEYS");
    expect(pageSource).toContain("/admin/analytics");
  });

  it("preserves period when returning to reports hub", () => {
    expect(pageSource).toContain('adminSpaTo("/admin/reports")}?period=');
  });
});
