import { describe, expect, it } from "vitest";
import { computeVat, sumLineVat } from "./computeVat";

describe("computeVat", () => {
  it("extracts inclusive VAT at 15%", () => {
    const r = computeVat({ baseAmount: 115, ratePercent: 15, inclusive: true, currency: "ZAR" });
    expect(r.grossAmount).toBe(115);
    expect(r.taxAmount).toBe(15);
    expect(r.netAmount).toBe(100);
  });

  it("adds exclusive VAT on top", () => {
    const r = computeVat({ baseAmount: 100, ratePercent: 15, inclusive: false, currency: "ZAR" });
    expect(r.netAmount).toBe(100);
    expect(r.taxAmount).toBe(15);
    expect(r.grossAmount).toBe(115);
  });

  it("returns zero tax when rate is 0", () => {
    const r = computeVat({ baseAmount: 200, ratePercent: 0, inclusive: true });
    expect(r.taxAmount).toBe(0);
    expect(r.grossAmount).toBe(200);
  });
});

describe("sumLineVat", () => {
  it("sums per-line rounded tax", () => {
    const total = sumLineVat(
      [
        { baseAmount: 100, ratePercent: 15, inclusive: false },
        { baseAmount: 50, ratePercent: 15, inclusive: false },
      ],
      "ZAR",
    );
    expect(total).toBe(22.5);
  });

  it("extracts inclusive VAT per line before summing", () => {
    const total = sumLineVat([{ baseAmount: 115, ratePercent: 15, inclusive: true }], "ZAR");
    expect(total).toBe(15);
  });
});
