import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(__dirname, "FinanceOverviewPage.tsx"), "utf8");

describe("FinanceOverviewPage filter and API wiring", () => {
  it("reads date, type, page, and provider filters from URL search params", () => {
    expect(pageSource).toContain('sp.get("start_date")');
    expect(pageSource).toContain('sp.get("end_date")');
    expect(pageSource).toContain('sp.get("type")');
    expect(pageSource).toContain('sp.get("page")');
    expect(pageSource).toContain('sp.get("provider_id")');
  });

  it("resets page when filters change", () => {
    expect(pageSource).toContain("resetPage");
    expect(pageSource).toMatch(/patchParams\([^)]*,\s*true\)/);
  });

  it("calls summary and transactions APIs with aligned date and provider params", () => {
    expect(pageSource).toContain("/api/admin/finance/summary");
    expect(pageSource).toContain("/api/admin/finance/transactions");
    expect(pageSource).toContain('p.set("start_date", start)');
    expect(pageSource).toContain('p.set("end_date", end)');
    expect(pageSource).toContain('p.set("provider_id", providerId)');
  });

  it("surfaces platform cash position in reconciliation controls", () => {
    expect(pageSource).toContain("platform_cash_position");
    expect(pageSource).toContain("Net platform cash");
  });

  it("maps export filter to transaction_type param", () => {
    expect(pageSource).toContain("/api/admin/export/finance");
    expect(pageSource).toContain('p.set("transaction_type", txType)');
  });

  it("surfaces settled service GMV with gmv_growth trend", () => {
    expect(pageSource).toContain("Settled service GMV");
    expect(pageSource).toContain("summary.gmv_growth");
    expect(pageSource).toContain("summary.service_collected_gross");
  });

  it("uses separate query keys for summary range vs transaction filters", () => {
    expect(pageSource).toContain("adminQueryKeys.finance.summary(rangeKey");
    expect(pageSource).toContain("adminQueryKeys.finance.transactions(txFilters)");
  });
});
