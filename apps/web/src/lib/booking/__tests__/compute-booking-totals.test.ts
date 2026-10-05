import { describe, expect, it } from "vitest";
import { computeBookingPayableTotal, computeBookingTotals } from "../compute-booking-totals";

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

  it("does not add extracted tax to total when prices are tax-inclusive", () => {
    const totals = computeBookingTotals({
      selectedServices: [{ id: "s1", price: 115, currency: "ZAR" }],
      selectedAddons: [],
      selectedProducts: [],
      taxAmount: 15,
      taxIncluded: true,
      serviceFeeAmount: 5,
      tipAmount: 10,
      defaultCurrency: "ZAR",
    });
    expect(totals.total).toBe(130);
  });

  it("computeBookingPayableTotal matches validate-booking exclusive path", () => {
    expect(
      computeBookingPayableTotal({
        subtotalAfterDiscounts: 100,
        taxAmount: 15,
        taxIncluded: false,
        serviceFeeAmount: 5,
        tipAmount: 10,
      }),
    ).toBe(130);
  });
});
