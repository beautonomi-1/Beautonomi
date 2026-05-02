import { describe, it, expect } from "vitest";
import { packageReportBookedValue } from "../package-report-value";

describe("packageReportBookedValue", () => {
  it("uses catalog fixed price when set", () => {
    expect(
      packageReportBookedValue({
        catalogPrice: 500,
        catalogDiscountPercent: 10,
        bookingServicesLineSum: 800,
      })
    ).toBe(500);
  });

  it("derives net from %-off when no fixed price", () => {
    expect(
      packageReportBookedValue({
        catalogPrice: null,
        catalogDiscountPercent: 20,
        bookingServicesLineSum: 1000,
      })
    ).toBe(800);
  });

  it("treats catalog price 0 as unset and uses percentage when available", () => {
    expect(
      packageReportBookedValue({
        catalogPrice: 0,
        catalogDiscountPercent: 20,
        bookingServicesLineSum: 1000,
      })
    ).toBe(800);
  });

  it("falls back to service line sum when no catalog discount", () => {
    expect(
      packageReportBookedValue({
        catalogPrice: null,
        catalogDiscountPercent: null,
        bookingServicesLineSum: 450,
      })
    ).toBe(450);
  });
});
