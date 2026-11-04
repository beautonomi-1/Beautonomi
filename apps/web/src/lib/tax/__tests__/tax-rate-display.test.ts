import { describe, expect, it } from "vitest";
import { isStandardVatRatePercent, normalizeTaxRatePercent } from "../tax-rate-display";

describe("normalizeTaxRatePercent", () => {
  it("treats percent-scale snapshots as-is", () => {
    expect(normalizeTaxRatePercent(15)).toBe(15);
  });

  it("converts legacy fraction snapshots to percent", () => {
    expect(normalizeTaxRatePercent(0.15)).toBe(15);
  });

  it("returns 0 for missing or invalid", () => {
    expect(normalizeTaxRatePercent(null)).toBe(0);
    expect(normalizeTaxRatePercent(undefined)).toBe(0);
    expect(normalizeTaxRatePercent(0)).toBe(0);
  });
});

describe("isStandardVatRatePercent", () => {
  it("accepts 15% in either storage shape", () => {
    expect(isStandardVatRatePercent(15)).toBe(true);
    expect(isStandardVatRatePercent(0.15)).toBe(true);
  });

  it("rejects below standard", () => {
    expect(isStandardVatRatePercent(14)).toBe(false);
    expect(isStandardVatRatePercent(0.14)).toBe(false);
  });
});
