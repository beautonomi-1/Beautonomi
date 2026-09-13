import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("FX plan compliance (static)", () => {
  it("defaults Frankfurter host to api.frankfurter.dev", () => {
    const src = read("apps/web/src/lib/fx/frankfurter-reference-rate.ts");
    expect(src).toContain("https://api.frankfurter.dev");
    expect(src).not.toContain("/v1/latest");
  });

  it("cron throws on required missing; refresh does not", () => {
    const cron = read("apps/web/src/app/api/cron/fx-reference-rates/route.ts");
    const refresh = read("apps/web/src/app/api/admin/finance/fx-rates/refresh/route.ts");
    expect(cron).toContain("throwOnRequiredMissing: true");
    expect(refresh).toContain("throwOnRequiredMissing: false");
  });

  it("ingest records sanity drops in warnings", () => {
    const src = read("apps/web/src/lib/fx/ingest-reference-rates.ts");
    expect(src).toContain("sanity_drop:");
  });

  it("charge paths do not multiply amounts by FX rate", () => {
    const paths = [
      "apps/web/src/app/api/payments/initialize/route.ts",
      "apps/web/src/app/api/public/bookings/_helpers/process-payment.ts",
      "apps/web/src/app/api/public/gift-cards/purchase/route.ts",
      "apps/web/src/app/api/paystack/initialize/route.ts",
    ];
    for (const rel of paths) {
      const src = read(rel);
      expect(src).toContain("assertReportingCurrencyReady");
      expect(src).not.toMatch(/amount\s*[*\/]\s*.*[Ff]x|[Ff]x[Rr]ate\s*[*\/]/);
    }
  });

  it("override and refresh call writeAuditLog", () => {
    const main = read("apps/web/src/app/api/admin/finance/fx-rates/route.ts");
    const refresh = read("apps/web/src/app/api/admin/finance/fx-rates/refresh/route.ts");
    expect(main).toContain("finance.fx.override");
    expect(main).toContain("finance.fx.clear");
    expect(refresh).toContain("finance.fx.refresh");
    expect(main).toContain("writeAuditLog");
    expect(refresh).toContain("writeAuditLog");
  });

  it("split-date fallback uses direct pair fetch", () => {
    const ingest = read("apps/web/src/lib/fx/ingest-reference-rates.ts");
    const frank = read("apps/web/src/lib/fx/frankfurter-reference-rate.ts");
    expect(ingest).toContain("fetchFrankfurterPairRate");
    expect(frank).toContain("/v2/rate/");
  });

  it("ledger convert uses get_fx_rate for full lookup parity", () => {
    const sql = readFileSync(
      join(repoRoot, "supabase/migrations/891_fx_convert_get_fx_rate_parity.sql"),
      "utf8",
    );
    expect(sql).toContain("get_fx_rate");
    expect(sql).not.toContain("resolve_fx_reference_rate");
  });

  it("Apple IAP adjacent paths use getFxRate RPC wrapper", () => {
    const consumption = read("apps/web/src/lib/iap/apple/consumption.ts");
    const settlement = read("apps/web/src/lib/iap/apple/settlement-import.ts");
    expect(consumption).toContain("getFxRate");
    expect(settlement).toContain("getFxRate");
  });
});
