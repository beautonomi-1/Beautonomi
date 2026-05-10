import { describe, it, expect } from "vitest";
import {
  computeBookingReceiptFinancials,
  reconcileReceiptTotal,
} from "../build-booking-receipt";

/**
 * Hardened scenario tests that exercise the same financial slice both customer
 * and provider receipt routes feed to JSON / PDF surfaces. We assert exact
 * decomposed values (subtotal lines-only, decomposed discount columns,
 * wallet/gift as settlement) so any regression to legacy "subtotal − travel"
 * or "membership inside discount_amount" trips the test.
 */

const BASE_ROW = {
  tax_amount: 0,
  platform_fee_amount: 0,
  service_fee_amount: 0,
  travel_fee: 0,
  tip_amount: 0,
  discount_amount: 0,
  promotion_discount_amount: 0,
  membership_discount_amount: 0,
  loyalty_discount_amount: 0,
  total_paid: 0,
  total_refunded: 0,
  wallet_amount: 0,
  gift_card_amount: 0,
  cancellation_fee: 0,
};

describe("receipt financial scenarios (provider walk-in / customer at-home / wallet split)", () => {
  it("provider walk-in screenshot: R60 service + R100 travel + 9% membership + R5.40 tip", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 60,
        travel_fee: 100,
        tip_amount: 5.4,
        membership_discount_amount: 5.4,
        total_amount: 160,
        total_paid: 160,
        payment_status: "paid",
      },
      linesSubtotal: 60,
      booking_payments: [{ amount: 160, status: "completed" }],
      additional_charges: [],
    });

    expect(f.subtotal).toBe(60);
    expect(f.travelFee).toBe(100);
    expect(f.tipAmount).toBe(5.4);
    expect(f.membershipDiscount).toBe(5.4);
    expect(f.discount).toBe(0);
    expect(f.promotionDiscount).toBe(0);
    expect(f.loyaltyDiscount).toBe(0);
    expect(f.discountTotal).toBe(5.4);
    expect(f.totalFromRow).toBe(160);
    expect(f.amountPaid).toBe(160);
    expect(f.balanceDue).toBe(0);
    expect(f.walletCredit).toBe(0);
    expect(f.giftCardCredit).toBe(0);

    // Reconciliation invariant.
    const reconstructed = reconcileReceiptTotal({
      total: f.totalFromRow,
      subtotal: f.subtotal,
      travel_fee: f.travelFee,
      tax: f.tax,
      fees: f.platformFee,
      tip_amount: f.tipAmount,
      discount: f.discount,
      promotion_discount_amount: f.promotionDiscount,
      membership_discount_amount: f.membershipDiscount,
      loyalty_discount_amount: f.loyaltyDiscount,
      cancellation_fee: f.cancellationFee,
    });
    expect(reconstructed).toBeCloseTo(f.totalFromRow, 2);
  });

  it("customer at-home with 50% deposit collected", () => {
    const total = 154.6;
    const deposit = 77.3;
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 60,
        travel_fee: 100,
        membership_discount_amount: 5.4,
        total_amount: total,
        total_paid: deposit,
        payment_status: "partially_paid",
      },
      linesSubtotal: 60,
      booking_payments: [{ amount: deposit, status: "completed" }],
      additional_charges: [],
    });

    expect(f.totalFromRow).toBe(total);
    expect(f.amountPaid).toBe(deposit);
    expect(f.balanceDue).toBeCloseTo(total - deposit, 2);
  });

  it("full payment walk-in", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        total_amount: 200,
        total_paid: 200,
        payment_status: "paid",
      },
      linesSubtotal: 200,
      booking_payments: [{ amount: 200, status: "completed" }],
      additional_charges: [],
    });
    expect(f.balanceDue).toBe(0);
    expect(f.amountPaid).toBe(200);
  });

  it("wallet + card split: separate booking_payments rows; wallet not surfaced as discount", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 154.6,
        wallet_amount: 50,
        total_amount: 154.6,
        total_paid: 154.6,
        payment_status: "paid",
      },
      linesSubtotal: 154.6,
      booking_payments: [
        { amount: 50, status: "completed" },
        { amount: 104.6, status: "completed" },
      ],
      additional_charges: [],
    });
    expect(f.amountPaid).toBe(154.6);
    expect(f.balanceDue).toBe(0);
    expect(f.walletCredit).toBe(50);
    expect(f.discount).toBe(0);
    expect(f.discountTotal).toBe(0);
  });

  it("partial refund: refund reduces effective_paid for outstanding display", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        total_amount: 200,
        total_paid: 200,
        total_refunded: 50,
        payment_status: "partially_paid",
      },
      linesSubtotal: 200,
      booking_payments: [{ amount: 200, status: "completed" }],
      additional_charges: [],
    });
    expect(f.totalRefundedRow).toBe(50);
    expect(f.amountPaid).toBe(200);
    /** computeBookingOutstandingDisplay subtracts refunded from effective_paid by design — refunded amount surfaces as outstanding for display. */
    expect(f.balanceDue).toBe(50);
  });

  it("full refund: payment_status='refunded' → outstanding 0", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        total_amount: 200,
        total_paid: 200,
        total_refunded: 200,
        payment_status: "refunded",
      },
      linesSubtotal: 200,
      booking_payments: [{ amount: 200, status: "completed" }],
      additional_charges: [],
    });
    expect(f.balanceDue).toBe(0);
  });

  it("promo + membership both decomposed, never double-counted", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        promotion_discount_amount: 20,
        membership_discount_amount: 16.2,
        total_amount: 163.8,
        total_paid: 163.8,
        payment_status: "paid",
      },
      linesSubtotal: 200,
      booking_payments: [{ amount: 163.8, status: "completed" }],
      additional_charges: [],
    });
    expect(f.promotionDiscount).toBe(20);
    expect(f.membershipDiscount).toBe(16.2);
    expect(f.discount).toBe(0);
    expect(f.discountTotal).toBe(36.2);
    expect(f.totalFromRow).toBeCloseTo(163.8, 2);
  });

  it("at_home with travel never re-subtracted from subtotal (stored as lines-only)", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        travel_fee: 75,
        total_amount: 275,
        total_paid: 275,
        payment_status: "paid",
      },
      linesSubtotal: 200,
      booking_payments: [{ amount: 275, status: "completed" }],
      additional_charges: [],
    });
    expect(f.subtotal).toBe(200);
    expect(f.travelFee).toBe(75);
    expect(f.totalFromRow).toBe(275);
  });

  it("platform fee zero on bookings.platform_fee_amount falls back to legacy service_fee_amount", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 100,
        platform_fee_amount: 0,
        service_fee_amount: 8.6,
        total_amount: 108.6,
        total_paid: 108.6,
        payment_status: "paid",
      },
      linesSubtotal: 100,
      booking_payments: [{ amount: 108.6, status: "completed" }],
      additional_charges: [],
    });
    expect(f.platformFee).toBe(8.6);
  });

  it("amount_paid prefers total_paid (trigger-maintained) over summing booking_payments + wallet/gift", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        ...BASE_ROW,
        subtotal: 200,
        wallet_amount: 50,
        total_amount: 200,
        total_paid: 200, // already includes wallet row after migration 582
        payment_status: "paid",
      },
      linesSubtotal: 200,
      booking_payments: [
        { amount: 50, status: "completed" }, // wallet row
        { amount: 150, status: "completed" }, // card row
      ],
      additional_charges: [],
    });
    // 200, not 200 + 50 (no double-count)
    expect(f.amountPaid).toBe(200);
  });
});
