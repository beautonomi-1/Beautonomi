import { describe, expect, it } from "vitest";
import { hasStaleLegacyCommissionRates, resolveStaffRates, shownCommissionRate } from "../resolve-staff-rates";

describe("resolveStaffRates", () => {
  it("prefers explicit service/product rates including zero", () => {
    expect(
      resolveStaffRates({
        service_commission_rate: 0,
        product_commission_rate: 10,
        commission_rate: 40,
      }),
    ).toEqual({ serviceRate: 0, productRate: 10 });
  });

  it("falls back to legacy when service/product unset", () => {
    expect(
      resolveStaffRates({ commission_rate: 35 }),
    ).toEqual({ serviceRate: 35, productRate: 35 });
    expect(
      resolveStaffRates({ commission_percentage: 40 }),
    ).toEqual({ serviceRate: 40, productRate: 40 });
    expect(
      resolveStaffRates({ commission_rate: 0, commission_percentage: 40 }),
    ).toEqual({ serviceRate: 0, productRate: 0 });
  });

  it("detects stale legacy-only rows", () => {
    expect(
      hasStaleLegacyCommissionRates({
        commission_rate: 40,
        service_commission_rate: 0,
        product_commission_rate: 0,
      }),
    ).toBe(true);
  });

  it("shows 0% when services are 0% even if another rate is saved", () => {
    expect(shownCommissionRate(0, 1000, 0)).toBe(0);
    expect(shownCommissionRate(0, 0, 0)).toBe(0);
    expect(shownCommissionRate(340, 1000, 40)).toBe(34);
    expect(shownCommissionRate(-20, -200, 10)).toBe(10);
  });
});
