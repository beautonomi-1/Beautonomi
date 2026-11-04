import { describe, expect, it } from "vitest";
import { recomputeProviderBookingEditTotals } from "../recompute-provider-booking-edit-totals";

const base = {
  discountAmount: 0,
  promotionDiscountAmount: 0,
  membershipDiscountAmount: 0,
  loyaltyDiscountAmount: 0,
  travelFee: 0,
  tipAmount: 0,
  serviceFeeAmount: 0,
  inclusive: true,
};

describe("recomputeProviderBookingEditTotals", () => {
  it("charges no VAT when the provider is not registered, even if a rate is supplied", () => {
    const result = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 115,
      registered: false,
      ratePercent: 15,
    });
    expect(result).toEqual({ taxAmount: 0, taxRatePercent: 0, totalAmount: 115 });
  });

  it("extracts 15% from an inclusive shelf price", () => {
    const result = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 115,
      registered: true,
      ratePercent: 15,
      inclusive: true,
    });
    expect(result.taxAmount).toBe(15);
    expect(result.taxRatePercent).toBe(15);
    expect(result.totalAmount).toBe(115);
  });

  it("adds 15% on top of an exclusive price and keeps travel and the service fee outside the tax", () => {
    const result = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 100,
      travelFee: 20,
      serviceFeeAmount: 10,
      registered: true,
      ratePercent: 15,
      inclusive: false,
    });
    expect(result.taxAmount).toBe(15);
    expect(result.totalAmount).toBe(145);
  });

  it("taxes the amount after promotion, membership, and loyalty discounts", () => {
    const result = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 200,
      promotionDiscountAmount: 50,
      membershipDiscountAmount: 25,
      loyaltyDiscountAmount: 25,
      registered: true,
      ratePercent: 15,
      inclusive: false,
    });
    expect(result.taxAmount).toBe(15);
    expect(result.totalAmount).toBe(115);
  });
});
