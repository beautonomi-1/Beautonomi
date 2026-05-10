import { describe, it, expect } from "vitest";
import { computeBookingOutstandingDisplay } from "../display-invariants";

/**
 * §Finance-truth 2026-05: post migration 582 the booking trigger sums
 * `booking_payments.amount` (including wallet/gift synthetic rows) into
 * `bookings.total_paid`. The OLD outstanding formula
 *   total - effective_paid - wallet - gift
 * therefore double-subtracts wallet/gift whenever a booking_payments row
 * exists for the same credit, which lets providers under-collect (and the
 * UI hide) the real balance due. The NEW formula uses
 *   total - max(effective_paid, wallet+gift)
 * so wallet+gift legacy rows still cover their share without ever being
 * subtracted twice.
 */
describe("computeBookingOutstandingDisplay — no wallet/gift double-subtract", () => {
  it("post-582 wallet-only deposit on a partially-paid booking", () => {
    // Total R200, deposit R100 paid via wallet. Migration 582 backfilled a
    // wallet booking_payments row → total_paid = 100. wallet_amount = 100.
    // True outstanding (balance to collect at appointment) = 100.
    // OLD formula: 200 - 100 - 100 - 0 = 0 (BUG: hides R100 due)
    // NEW formula: 200 - max(100, 100) = 100 ✓
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 100,
        totalRefunded: 0,
        walletAmount: 100,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 0,
        paymentStatus: "partially_paid",
      }),
    ).toBe(100);
  });

  it("post-582 wallet+gift+card fully paid", () => {
    // wallet 50 + gift 75 + card 75 = 200 total_paid; balance = 0.
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 200,
        totalRefunded: 0,
        walletAmount: 50,
        giftCardAmount: 75,
        unpaidAdditionalCharges: 0,
        paymentStatus: "paid",
      }),
    ).toBe(0);
  });

  it("pre-582 booking with only wallet_amount column (no booking_payments row)", () => {
    // Legacy bookings before migration 582 may have wallet_amount=200 but
    // total_paid=0 (no synthetic booking_payments row was ever inserted).
    // Outstanding should still be 0 — wallet+gift coverage takes over.
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 0,
        totalRefunded: 0,
        walletAmount: 200,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 0,
        paymentStatus: "paid",
      }),
    ).toBe(0);
  });

  it("partial card payment without wallet/gift", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 60,
        totalRefunded: 0,
        walletAmount: 0,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 0,
        paymentStatus: "partially_paid",
      }),
    ).toBe(140);
  });

  it("partial refund reduces effective paid; wallet/gift still don't double-count", () => {
    // total 200, paid 200 (50 wallet + 150 card), refunded 50.
    // effective_paid = 150. wallet+gift coverage = 50. raw = 200 - max(150, 50) = 50.
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 200,
        totalRefunded: 50,
        walletAmount: 50,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 0,
        paymentStatus: "partially_refunded",
      }),
    ).toBe(50);
  });

  it("fully refunded booking: outstanding always 0", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 200,
        totalRefunded: 200,
        walletAmount: 50,
        giftCardAmount: 75,
        unpaidAdditionalCharges: 0,
        paymentStatus: "refunded",
      }),
    ).toBe(0);
  });

  it("unpaid additional charges add to balance due", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 200,
        totalPaid: 200,
        totalRefunded: 0,
        walletAmount: 0,
        giftCardAmount: 0,
        unpaidAdditionalCharges: 35,
        paymentStatus: "paid",
      }),
    ).toBe(35);
  });

  it("gift-card-only deposit on partially-paid booking", () => {
    // Total R300, deposit R100 paid via gift card. After 582 backfill:
    // total_paid = 100, gift_card_amount = 100. True remaining = 200.
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 300,
        totalPaid: 100,
        totalRefunded: 0,
        walletAmount: 0,
        giftCardAmount: 100,
        unpaidAdditionalCharges: 0,
        paymentStatus: "partially_paid",
      }),
    ).toBe(200);
  });

  it("over-coverage clamps to 0 (never negative)", () => {
    expect(
      computeBookingOutstandingDisplay({
        totalAmount: 100,
        totalPaid: 200,
        totalRefunded: 0,
        walletAmount: 50,
        giftCardAmount: 75,
        unpaidAdditionalCharges: 0,
        paymentStatus: "paid",
      }),
    ).toBe(0);
  });
});
