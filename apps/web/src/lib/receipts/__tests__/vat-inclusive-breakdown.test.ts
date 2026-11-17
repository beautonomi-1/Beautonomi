import { describe, it, expect } from "vitest";
import { computeVat } from "@beautonomi/utils";
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

  // F2-38: a single inclusive-VAT implementation. The canonical `computeVat`
  // rounds the tax first and derives net = gross − tax; a net-first split
  // disagrees by 1c on tie cases (e.g. 0.75 / 1.2 = 0.625).
  it.each([
    [0.75, 20],
    [0.03, 20],
    [0.63, 20],
    [99.99, 15],
    [1234.56, 15],
  ])("agrees with the canonical computeVat for gross %s at %s%%", (gross, rate) => {
    const canonical = computeVat({ baseAmount: gross, ratePercent: rate, inclusive: true, currency: "ZAR" });
    const result = computeVatInclusiveBreakdown(gross, rate);
    expect(result.vatAmount).toBe(canonical.taxAmount);
    expect(result.subtotalExclVat).toBe(canonical.netAmount);
    expect(result.subtotalExclVat + result.vatAmount).toBeCloseTo(gross, 2);
  });
});
