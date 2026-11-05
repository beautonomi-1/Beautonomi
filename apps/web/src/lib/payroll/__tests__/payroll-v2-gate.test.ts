import { describe, expect, it } from "vitest";
import { payrollV2StatutoryActive } from "../payroll-v2-gate";

describe("payrollV2StatutoryActive", () => {
  it("is off when the provider setting is off, even if the flag is on", () => {
    expect(payrollV2StatutoryActive({ providerEnabled: false, flagEnabled: true })).toBe(false);
  });

  it("is on when the provider setting is on and the flag row is missing", () => {
    expect(payrollV2StatutoryActive({ providerEnabled: true, flagEnabled: null })).toBe(true);
  });

  it("follows the superadmin flag when the row exists", () => {
    expect(payrollV2StatutoryActive({ providerEnabled: true, flagEnabled: true })).toBe(true);
    expect(payrollV2StatutoryActive({ providerEnabled: true, flagEnabled: false })).toBe(false);
  });
});
