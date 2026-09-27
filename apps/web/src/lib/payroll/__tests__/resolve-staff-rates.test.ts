import { describe, expect, it } from "vitest";
import { hasStaleLegacyCommissionRates, resolveStaffRates } from "../resolve-staff-rates";

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
});
