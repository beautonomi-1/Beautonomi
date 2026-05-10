import { describe, it, expect } from "vitest";
import { computeBookingReceiptFinancials } from "@/lib/receipts/build-booking-receipt";

/**
 * Mirrors `update_booking_payment_status` (migration 582) — status logic
 * extracted into JS so we can exhaustively test the boundaries.
 *
 *   total_paid + 0.01 >= total_amount  →  paid (or partially_paid if any refund)
 *   total_paid > 0                      →  partially_paid
 *   else                                →  pending
 *
 * `total_paid` is `SUM(booking_payments.amount)` across {completed, partially_refunded}.
 * After migration 582, wallet/gift contribute their own rows and are part of that sum.
 */
type DbPaymentRow = { amount: number; status: "completed" | "partially_refunded" | "pending" };

function deriveStatus(totalAmount: number, payments: DbPaymentRow[], refundedTotal = 0) {
  const totalPaid = payments
    .filter((p) => p.status === "completed" || p.status === "partially_refunded")
    .reduce((s, p) => s + p.amount, 0);
  if (totalPaid === 0) return { status: "pending", totalPaid };
  if (refundedTotal >= totalPaid) return { status: "refunded", totalPaid };
  if (totalPaid + 0.01 >= totalAmount) {
    return { status: refundedTotal > 0 ? "partially_paid" : "paid", totalPaid };
  }
  return { status: "partially_paid", totalPaid };
}

describe("wallet + card → paid status (migration 582 trigger semantics)", () => {
  it("wallet + card sums to total_amount → paid", () => {
    const total = 154.6;
    const r = deriveStatus(total, [
      { amount: 50, status: "completed" }, // wallet booking_payments row
      { amount: 104.6, status: "completed" }, // card booking_payments row
    ]);
    expect(r.status).toBe("paid");
    expect(r.totalPaid).toBeCloseTo(total, 2);
  });

  it("gift_card + card sums to total_amount → paid", () => {
    const total = 200;
    const r = deriveStatus(total, [
      { amount: 75, status: "completed" }, // gift_card row
      { amount: 125, status: "completed" }, // card row
    ]);
    expect(r.status).toBe("paid");
    expect(r.totalPaid).toBe(200);
  });

  it("paid threshold tolerates 1 cent under (rounding)", () => {
    const total = 100;
    const r = deriveStatus(total, [{ amount: 99.99, status: "completed" }]);
    expect(r.status).toBe("paid");
  });

  it("0.02 short stays partially_paid", () => {
    const total = 100;
    const r = deriveStatus(total, [{ amount: 99.98, status: "completed" }]);
    expect(r.status).toBe("partially_paid");
  });

  it("only deposit collected → partially_paid", () => {
    const total = 154.6;
    const r = deriveStatus(total, [{ amount: 77.3, status: "completed" }]);
    expect(r.status).toBe("partially_paid");
  });

  it("after a refund equal to all payments → refunded", () => {
    const total = 100;
    const r = deriveStatus(total, [{ amount: 100, status: "completed" }], 100);
    expect(r.status).toBe("refunded");
  });

  it("partial refund leaves status as partially_paid even when paid in full first", () => {
    const total = 100;
    const r = deriveStatus(total, [{ amount: 100, status: "completed" }], 25);
    expect(r.status).toBe("partially_paid");
  });
});

describe("receipt builder consumes wallet/gift booking_payments rows correctly", () => {
  it("wallet + card split: receipt shows full amount_paid, balance 0", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        subtotal: 60,
        travel_fee: 100,
        tax_amount: 0,
        platform_fee_amount: 0,
        service_fee_amount: 0,
        tip_amount: 0,
        discount_amount: 0,
        promotion_discount_amount: 0,
        membership_discount_amount: 5.4,
        loyalty_discount_amount: 0,
        total_amount: 154.6,
        total_paid: 154.6, // trigger-maintained
        total_refunded: 0,
        wallet_amount: 50,
        gift_card_amount: 0,
        payment_status: "paid",
      },
      linesSubtotal: 60,
      booking_payments: [
        { amount: 50, status: "completed" },
        { amount: 104.6, status: "completed" },
      ],
      additional_charges: [],
    });
    expect(f.amountPaid).toBeCloseTo(154.6, 2);
    expect(f.balanceDue).toBe(0);
    expect(f.walletCredit).toBe(50);
    expect(f.giftCardCredit).toBe(0);
  });

  it("gift_card + card split: balance 0, wallet not surfaced as discount", () => {
    const f = computeBookingReceiptFinancials({
      row: {
        subtotal: 200,
        travel_fee: 0,
        tax_amount: 0,
        platform_fee_amount: 0,
        service_fee_amount: 0,
        tip_amount: 0,
        discount_amount: 0,
        promotion_discount_amount: 0,
        membership_discount_amount: 0,
        loyalty_discount_amount: 0,
        total_amount: 200,
        total_paid: 200,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 75,
        payment_status: "paid",
      },
      linesSubtotal: 200,
      booking_payments: [
        { amount: 75, status: "completed" },
        { amount: 125, status: "completed" },
      ],
      additional_charges: [],
    });
    expect(f.amountPaid).toBeCloseTo(200, 2);
    expect(f.balanceDue).toBe(0);
    expect(f.giftCardCredit).toBe(75);
    expect(f.discountTotal).toBe(0); // wallet/gift NEVER counted as discount
  });
});
