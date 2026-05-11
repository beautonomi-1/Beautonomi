import { describe, it, expect } from "vitest";
import { computeBookingReceiptFinancials } from "../build-booking-receipt";

describe("computeBookingReceiptFinancials", () => {
  it("uses stored subtotal when set and prefers total_paid for amount_paid", () => {
    const row = {
      subtotal: 60,
      tax_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 8.6,
      travel_fee: 100,
      tip_amount: 5.4,
      discount_amount: 0,
      promotion_discount_amount: 0,
      membership_discount_amount: 5.4,
      loyalty_discount_amount: 0,
      total_amount: 154.6,
      total_paid: 154.6,
      total_refunded: 0,
      wallet_amount: 0,
      gift_card_amount: 0,
      payment_status: "paid",
    };
    const f = computeBookingReceiptFinancials({
      row,
      linesSubtotal: 999,
      booking_payments: [{ amount: 50, status: "completed" }],
      additional_charges: [],
    });
    expect(f.subtotal).toBe(60);
    expect(f.amountPaid).toBe(154.6);
    expect(f.balanceDue).toBe(0);
    expect(f.discountTotal).toBeCloseTo(5.4, 5);
  });

  it("falls back to platform_fee 0 with legacy service_fee_amount", () => {
    const row = {
      subtotal: 100,
      tax_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 12,
      travel_fee: 0,
      tip_amount: 0,
      discount_amount: 0,
      promotion_discount_amount: 0,
      membership_discount_amount: 0,
      loyalty_discount_amount: 0,
      total_amount: 112,
      total_paid: 0,
      total_refunded: 0,
      wallet_amount: 0,
      gift_card_amount: 0,
      payment_status: "pending",
    };
    const f = computeBookingReceiptFinancials({
      row,
      linesSubtotal: 100,
      booking_payments: [],
      additional_charges: [],
    });
    expect(f.platformFee).toBe(12);
  });

  it("sums paid payment rows when total_paid is zero", () => {
    const row = {
      subtotal: 50,
      tax_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 0,
      travel_fee: 0,
      tip_amount: 0,
      discount_amount: 0,
      promotion_discount_amount: 0,
      membership_discount_amount: 0,
      loyalty_discount_amount: 0,
      total_amount: 50,
      total_paid: 0,
      total_refunded: 0,
      wallet_amount: 10,
      gift_card_amount: 5,
      payment_status: "partially_paid",
    };
    const f = computeBookingReceiptFinancials({
      row,
      linesSubtotal: 50,
      booking_payments: [
        { amount: 20, status: "completed" },
        { amount: 10, status: "partially_refunded" },
        { amount: 15, status: "pending" },
      ],
      additional_charges: [],
    });
    expect(f.amountPaid).toBe(45);
  });
});
