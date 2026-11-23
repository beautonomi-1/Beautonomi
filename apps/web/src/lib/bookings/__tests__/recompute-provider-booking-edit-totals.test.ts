import { describe, expect, it } from "vitest";
import {
  paymentStatusAfterBookingTotal,
  platformFeeKeptOnRetailAdd,
  recomputeProviderBookingEditTotals,
  serviceFeeForUpdatedSubtotal,
  sumProviderBookingLineSubtotal,
} from "../recompute-provider-booking-edit-totals";

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

describe("sumProviderBookingLineSubtotal", () => {
  it("adds the retail line onto the service price and leaves membership discount out", () => {
    expect(
      sumProviderBookingLineSubtotal({
        servicePrices: ["49.86"],
        addons: [],
        productTotals: [150],
      }),
    ).toBe(199.86);
  });

  it("multiplies add-on unit price by quantity", () => {
    expect(
      sumProviderBookingLineSubtotal({
        servicePrices: [40],
        addons: [{ price: 15, quantity: 2 }],
        productTotals: [],
      }),
    ).toBe(70);
  });
});

describe("serviceFeeForUpdatedSubtotal", () => {
  it("keeps the post-discount 10% base when a product is added", () => {
    const fee = serviceFeeForUpdatedSubtotal({
      previousSubtotal: 49.86,
      nextSubtotal: 199.86,
      discountAmount: 0,
      promotionDiscountAmount: 0,
      membershipDiscountAmount: 2.49,
      loyaltyDiscountAmount: 0,
      travelFee: 0,
      percentage: 10,
      currentFeeAmount: 4.74,
    });
    expect(fee).toBe(19.74);
    const totals = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 199.86,
      membershipDiscountAmount: 2.49,
      tipAmount: 4.74,
      serviceFeeAmount: fee,
      registered: false,
      ratePercent: 0,
    });
    expect(totals.totalAmount).toBe(221.85);
  });
});

describe("platformFeeKeptOnRetailAdd", () => {
  it("keeps the online fee when a product is added for in-person collection", () => {
    const kept = platformFeeKeptOnRetailAdd({
      currentFeeAmount: 4.74,
      currentPercentage: 10,
      nextSubtotal: 199.86,
      discountAmount: 0,
      promotionDiscountAmount: 0,
      membershipDiscountAmount: 2.49,
      loyaltyDiscountAmount: 0,
      travelFee: 0,
    });
    expect(kept).toEqual({ feeAmount: 4.74, percentage: 0 });
    const totals = recomputeProviderBookingEditTotals({
      ...base,
      subtotal: 199.86,
      membershipDiscountAmount: 2.49,
      tipAmount: 4.74,
      serviceFeeAmount: kept.feeAmount,
      registered: false,
      ratePercent: 0,
    });
    expect(totals.totalAmount).toBe(206.85);
  });
});

describe("paymentStatusAfterBookingTotal", () => {
  it("marks a paid booking partially paid when a product raises the total", () => {
    expect(
      paymentStatusAfterBookingTotal({
        totalAmount: 206.85,
        totalPaid: 56.85,
        totalRefunded: 0,
        currentStatus: "paid",
      }),
    ).toBe("partially_paid");
  });

  it("stays paid when the collected amount still covers the new total", () => {
    expect(
      paymentStatusAfterBookingTotal({
        totalAmount: 56.85,
        totalPaid: 56.85,
        totalRefunded: 0,
        currentStatus: "paid",
      }),
    ).toBe("paid");
  });
});
