import { describe, it, expect } from "vitest";
import { computeBookingReceiptFinancials } from "../build-booking-receipt";

/**
 * §Finance-truth 2026-05: end-to-end receipt scenarios proving payment-mix
 * fixtures (wallet + Yoco, gift card + card, full cash, EFT, manual card,
 * deposit then balance) reconcile to the canonical invariant
 *   subtotal + travel + tax + fees + tip - all_discounts - cancellation = total
 * and that `amountPaid` reflects the canonical `total_paid` sum (post-582)
 * regardless of payment method composition.
 */
describe("payment-mix receipt scenarios — canonical reconciliation", () => {
  function build(row: Record<string, unknown>, payments: Array<Record<string, unknown>> = []) {
    const linesSubtotal = Number(row.subtotal ?? 0);
    return computeBookingReceiptFinancials({
      row,
      linesSubtotal,
      booking_payments: payments as never,
    });
  }

  it("wallet R50 + Yoco card R75 + gift R75 fully paid (split tender)", () => {
    const f = build(
      {
        subtotal: 200,
        total_amount: 200,
        total_paid: 200,
        total_refunded: 0,
        wallet_amount: 50,
        gift_card_amount: 75,
        payment_status: "paid",
      },
      [
        { amount: 50, status: "completed", payment_method: "wallet", payment_provider: "wallet" },
        { amount: 75, status: "completed", payment_method: "card", payment_provider: "yoco" },
        { amount: 75, status: "completed", payment_method: "gift_card", payment_provider: "gift_card" },
      ],
    );
    expect(f.totalFromRow).toBe(200);
    expect(f.amountPaid).toBe(200);
    expect(f.balanceDue).toBe(0);
  });

  it("EFT (bank_transfer) full payment", () => {
    const f = build(
      {
        subtotal: 1500,
        total_amount: 1500,
        total_paid: 1500,
        total_refunded: 0,
        payment_status: "paid",
      },
      [{ amount: 1500, status: "completed", payment_method: "bank_transfer", payment_provider: "other" }],
    );
    expect(f.amountPaid).toBe(1500);
    expect(f.balanceDue).toBe(0);
  });

  it("cash deposit only — partially_paid receipt shows real balance", () => {
    const f = build(
      {
        subtotal: 800,
        total_amount: 800,
        total_paid: 200,
        total_refunded: 0,
        payment_status: "partially_paid",
      },
      [{ amount: 200, status: "completed", payment_method: "cash", payment_provider: "cash" }],
    );
    expect(f.amountPaid).toBe(200);
    expect(f.balanceDue).toBe(600);
  });

  it("manual card (provider 'other' card) full payment", () => {
    const f = build(
      {
        subtotal: 425,
        total_amount: 425,
        total_paid: 425,
        total_refunded: 0,
        payment_status: "paid",
      },
      [{ amount: 425, status: "completed", payment_method: "card", payment_provider: "other" }],
    );
    expect(f.amountPaid).toBe(425);
    expect(f.balanceDue).toBe(0);
  });

  it("Yoco card deposit then balance collected later — two payment rows", () => {
    const f = build(
      {
        subtotal: 600,
        total_amount: 600,
        total_paid: 600,
        total_refunded: 0,
        payment_status: "paid",
      },
      [
        { amount: 200, status: "completed", payment_method: "card", payment_provider: "yoco" },
        { amount: 400, status: "completed", payment_method: "card", payment_provider: "yoco" },
      ],
    );
    expect(f.amountPaid).toBe(600);
    expect(f.balanceDue).toBe(0);
  });

  it("multi-service + add-on + travel + membership + tip reconciles", () => {
    const f = build(
      {
        subtotal: 250,
        travel_fee: 60,
        tax_amount: 15,
        platform_fee_amount: 10,
        tip_amount: 30,
        membership_discount_amount: 5,
        total_amount: 360,
        total_paid: 360,
        total_refunded: 0,
        payment_status: "paid",
      },
      [{ amount: 360, status: "completed", payment_method: "card", payment_provider: "yoco" }],
    );
    expect(f.totalFromRow).toBe(360);
    expect(f.balanceDue).toBe(0);
  });

  it("partial refund after wallet+card payment surfaces refunded balance", () => {
    const f = build(
      {
        subtotal: 200,
        total_amount: 200,
        total_paid: 200,
        total_refunded: 50,
        wallet_amount: 50,
        payment_status: "partially_refunded",
      },
      [
        { amount: 50, status: "completed", payment_method: "wallet", payment_provider: "wallet" },
        { amount: 150, status: "completed", payment_method: "card", payment_provider: "yoco" },
      ],
    );
    expect(f.totalRefundedRow).toBe(50);
    expect(f.balanceDue).toBe(50);
  });

  it("gift_card + card split with promotion + tax", () => {
    const f = build(
      {
        subtotal: 200,
        tax_amount: 10,
        promotion_discount_amount: 20,
        total_amount: 190,
        total_paid: 190,
        gift_card_amount: 75,
        payment_status: "paid",
      },
      [
        { amount: 75, status: "completed", payment_method: "gift_card", payment_provider: "gift_card" },
        { amount: 115, status: "completed", payment_method: "card", payment_provider: "yoco" },
      ],
    );
    expect(f.totalFromRow).toBe(190);
    expect(f.amountPaid).toBe(190);
    expect(f.balanceDue).toBe(0);
  });

  it("custom-offer-style booking with travel", () => {
    const f = build(
      {
        subtotal: 500,
        travel_fee: 50,
        total_amount: 550,
        total_paid: 550,
        payment_status: "paid",
      },
      [{ amount: 550, status: "completed", payment_method: "card", payment_provider: "paystack" }],
    );
    expect(f.totalFromRow).toBe(550);
    expect(f.balanceDue).toBe(0);
  });

  it("walk-in cash sale (provider booking_source) — no platform fee", () => {
    const f = build(
      {
        subtotal: 350,
        tip_amount: 50,
        total_amount: 400,
        total_paid: 400,
        payment_status: "paid",
      },
      [{ amount: 400, status: "completed", payment_method: "cash", payment_provider: "cash" }],
    );
    expect(f.totalFromRow).toBe(400);
    expect(f.balanceDue).toBe(0);
  });
});
