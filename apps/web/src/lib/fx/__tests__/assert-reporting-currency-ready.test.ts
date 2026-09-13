import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertReportingCurrencyReady,
  checkReportingCurrencyFreshness,
} from "../assert-reporting-currency-ready";
import * as resolveModule from "../resolve-reporting-rate";

describe("assert-reporting-currency-ready", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("ZA identity passes without lookup", async () => {
    const result = await assertReportingCurrencyReady({} as never, "ZAR");
    expect(result.ok).toBe(true);
  });

  it("checkout gate fails only when missing", async () => {
    vi.spyOn(resolveModule, "resolveReportingRate").mockResolvedValue({
      base: "USD",
      quote: "ZAR",
      at: new Date().toISOString(),
      rate: null,
      source: "legacy_fx_rates",
    });
    const missing = await assertReportingCurrencyReady({} as never, "USD");
    expect(missing.ok).toBe(false);
    if (missing.ok === false) expect(missing.code).toBe("FX_REPORTING_NOT_READY");

    vi.spyOn(resolveModule, "resolveReportingRate").mockResolvedValue({
      base: "USD",
      quote: "ZAR",
      at: new Date().toISOString(),
      rate: 18,
      source: "frankfurter",
      rateDate: "2020-01-01",
    });
    const staleOk = await assertReportingCurrencyReady({} as never, "USD");
    expect(staleOk.ok).toBe(true);
    if (staleOk.ok === true) expect(staleOk.stale).toBe(true);
  });

  it("launch checklist fails stale", async () => {
    vi.spyOn(resolveModule, "resolveReportingRate").mockResolvedValue({
      base: "KES",
      quote: "ZAR",
      at: new Date().toISOString(),
      rate: 0.12,
      source: "frankfurter",
      rateDate: "2020-01-01",
    });
    const fresh = await checkReportingCurrencyFreshness("KES");
    expect(fresh.ok).toBe(false);
    if (fresh.ok === false) expect(fresh.code).toBe("FX_REPORTING_STALE");
  });
});
