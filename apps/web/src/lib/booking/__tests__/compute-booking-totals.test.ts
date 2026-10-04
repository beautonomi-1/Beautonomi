import { describe, expect, it } from "vitest";
import { computeBookingTotals } from "../compute-booking-totals";

describe("computeBookingTotals", () => {
  it("sums services, addons, products, travel and subtracts discounts", () => {
    const totals = computeBookingTotals({
      selectedServices: [{ id: "s1", price: 100, currency: "ZAR" }],
      selectedAddons: [{ price: 20 }],
      selectedProducts: [{ price: 15, quantity: 2 }],
      travelFee: 10,
      couponDiscount: 25,
      taxAmount: 12,
      serviceFeeAmount: 5,
      tipAmount: 8,
      defaultCurrency: "ZAR",
    });
    expect(totals.servicesTotal).toBe(100);
    expect(totals.subtotalBeforeDiscounts).toBe(160);
    expect(totals.subtotalAfterDiscounts).toBe(135);
    expect(totals.total).toBe(160);
    expect(totals.currency).toBe("ZAR");
  });

  it("applies catalog package discount before coupon/membership", () => {
    const totals = computeBookingTotals({
      selectedServices: [{ id: "s1", price: 200, currency: "ZAR" }],
      selectedAddons: [],
      selectedProducts: [],
      selectedPackage: { price: 150, discount: 25 },
      couponDiscount: 10,
      membershipDiscount: 15,
      defaultCurrency: "ZAR",
    });
    expect(totals.packageDiscount).toBe(50);
    expect(totals.subtotalBeforeDiscounts).toBe(150);
    expect(totals.subtotalAfterDiscounts).toBe(125);
    expect(totals.total).toBe(125);
  });
});
