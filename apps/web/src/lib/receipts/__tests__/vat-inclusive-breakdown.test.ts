import { describe, it, expect } from "vitest";
import { computeVatInclusiveBreakdown } from "../vat-inclusive-breakdown";

describe("computeVatInclusiveBreakdown", () => {
  it("returns gross-only values when VAT rate is zero", () => {
    expect(computeVatInclusiveBreakdown(115, 0)).toEqual({
      gross: 115,
      subtotalExclVat: 115,
      vatAmount: 0,
      ratePercent: 0,
    });
  });

  it("splits a 15% VAT-inclusive amount", () => {
    const result = computeVatInclusiveBreakdown(115, 15);
    expect(result.gross).toBe(115);
    expect(result.subtotalExclVat).toBe(100);
    expect(result.vatAmount).toBe(15);
    expect(result.ratePercent).toBe(15);
  });

  it("rounds to two decimal places", () => {
    const result = computeVatInclusiveBreakdown(99.99, 15);
    expect(result.subtotalExclVat + result.vatAmount).toBeCloseTo(99.99, 2);
    expect(result.subtotalExclVat).toBe(86.95);
    expect(result.vatAmount).toBe(13.04);
  });
});
