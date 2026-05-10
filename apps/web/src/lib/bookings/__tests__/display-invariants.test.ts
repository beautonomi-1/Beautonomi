import { describe, it, expect } from "vitest";
import { reconcileReceiptTotal, computeBookingOutstandingDisplay } from "../display-invariants";

describe("display-invariants", () => {
  it("reconcileReceiptTotal subtracts decomposed discounts", () => {
    const reconstructed = reconcileReceiptTotal({
      total: 130,
      subtotal: 100,
      travel_fee: 50,
      tax: 0,
      fees: 0,
      tip_amount: 0,
      discount: 10,
      promotion_discount_amount: 5,
      membership_discount_amount: 2,
      loyalty_discount_amount: 3,
      cancellation_fee: 0,
    });
    expect(reconstructed).toBeCloseTo(130, 5);
  });

  it("computeBookingOutstandingDisplay returns 0 for fully paid", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 100,
        totalPaid: 100,
        totalRefunded: 0,
        walletAmount: 0,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 0,
        paymentStatus: "paid",
      }),
    ).toBe(0);
  });

  it("does not double-subtract wallet and gift amounts already represented in total_paid", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 500,
        totalPaid: 500,
        totalRefunded: 0,
        walletAmount: 150,
        giftCardAmount: 100,
        unpaidAdditionalCharges: 0,
        paymentStatus: "paid",
      }),
    ).toBe(0);
  });

  it("falls back to legacy wallet/gift coverage only when booking_payments are missing", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 500,
        totalPaid: 0,
        totalRefunded: 0,
        walletAmount: 150,
        giftCardAmount: 100,
        unpaidAdditionalCharges: 0,
        paymentStatus: "partial",
      }),
    ).toBe(250);
  });
});
