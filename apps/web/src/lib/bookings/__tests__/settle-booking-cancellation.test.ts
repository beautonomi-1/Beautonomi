import { describe, expect, it } from "vitest";
import {
  computeCancellationFeeForSettlement,
  computeEffectiveCollectedAmount,
} from "../settle-booking-cancellation";

describe("computeEffectiveCollectedAmount", () => {
  it("uses max(total_paid, wallet+gift) minus prior refunds", () => {
    expect(
      computeEffectiveCollectedAmount({
        id: "b1",
        provider_id: "p1",
        total_paid: 80,
        wallet_amount: 20,
        gift_card_amount: 10,
        total_refunded: 15,
      }),
    ).toBe(65);
  });
});

describe("computeCancellationFeeForSettlement", () => {
  const baseBooking = { id: "b1", provider_id: "p1", total_amount: 200 };

  it("provider cancel defaults to full refund and zero fee", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "provider",
      currency: "ZAR",
      policy: null,
    });
    expect(result.cancellationFeeApplied).toBe(0);
    expect(result.policyRefundAmount).toBe(200);
  });

  it("provider cancel honors explicit fee override", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "provider",
      currency: "ZAR",
      policy: null,
      explicitCancellationFee: 50,
    });
    expect(result.cancellationFeeApplied).toBe(50);
    expect(result.policyRefundAmount).toBe(150);
  });

  it("no-show uses explicit fee and refunds remainder", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "no_show",
      currency: "ZAR",
      policy: null,
      explicitCancellationFee: 75,
    });
    expect(result.cancellationFeeApplied).toBe(75);
    expect(result.policyRefundAmount).toBe(125);
  });

  it("customer late cancellation applies policy refund percentage", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "customer",
      currency: "ZAR",
      policy: {
        id: "p1",
        name: "Standard",
        hours_before: 24,
        refund_percentage: 50,
        fee_amount: 0,
        fee_type: "fixed",
        is_default: true,
        late_cancellation_type: "partial_refund",
      },
      isLateCancellation: true,
    });
    expect(result.policyRefundAmount).toBe(100);
    expect(result.cancellationFeeApplied).toBe(100);
  });

  it("portal early cancellation refunds full booking total", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "portal",
      currency: "ZAR",
      policy: {
        id: "p1",
        name: "Standard",
        hours_before: 24,
        refund_percentage: 0,
        fee_amount: 50,
        fee_type: "fixed",
        is_default: true,
        late_cancellation_type: "no_refund",
      },
      isLateCancellation: false,
    });
    expect(result.policyRefundAmount).toBe(200);
    expect(result.cancellationFeeApplied).toBe(0);
  });
});

describe("settleBookingNoShow fee math", () => {
  const baseBooking = {
    id: "b1",
    provider_id: "p1",
    total_amount: 200,
    total_paid: 200,
    wallet_amount: 0,
    gift_card_amount: 0,
    total_refunded: 0,
  };

  it("caps no-show fee at collected amount when booking total exceeds paid", () => {
    const partial = { ...baseBooking, total_paid: 60 };
    const bookingTotal = 200;
    const collected = computeEffectiveCollectedAmount(partial);
    const noShowFee = Math.min(75, bookingTotal, collected);
    const refundTotal = Math.max(0, bookingTotal - noShowFee);
    expect(collected).toBe(60);
    expect(noShowFee).toBe(60);
    expect(refundTotal).toBe(140);
  });

  it("no-show disabled refunds full booking total basis", () => {
    const result = computeCancellationFeeForSettlement({
      booking: baseBooking,
      cancelledBy: "no_show",
      currency: "ZAR",
      policy: null,
      explicitCancellationFee: 0,
    });
    expect(result.cancellationFeeApplied).toBe(0);
    expect(result.policyRefundAmount).toBe(200);
  });

  it("no-show wallet target respects partial payment", () => {
    const partial = { ...baseBooking, total_paid: 50 };
    const { policyRefundAmount } = computeCancellationFeeForSettlement({
      booking: partial,
      cancelledBy: "no_show",
      currency: "ZAR",
      policy: null,
      explicitCancellationFee: 30,
    });
    const walletTarget = Math.min(
      policyRefundAmount,
      computeEffectiveCollectedAmount(partial),
    );
    expect(policyRefundAmount).toBe(170);
    expect(walletTarget).toBe(50);
  });
});

describe("customer/portal cancel wallet cap", () => {
  it("wallet refund target does not exceed collected funds", () => {
    const booking = {
      id: "b1",
      provider_id: "p1",
      total_amount: 200,
      total_paid: 80,
      wallet_amount: 0,
      gift_card_amount: 0,
      total_refunded: 0,
    };
    const { policyRefundAmount } = computeCancellationFeeForSettlement({
      booking,
      cancelledBy: "customer",
      currency: "ZAR",
      policy: {
        id: "p1",
        name: "Standard",
        hours_before: 24,
        refund_percentage: 100,
        fee_amount: 0,
        fee_type: "fixed",
        is_default: true,
        late_cancellation_type: "full_refund",
      },
      isLateCancellation: false,
    });
    const collected = computeEffectiveCollectedAmount(booking);
    const walletTarget = Math.min(policyRefundAmount, collected);
    expect(walletTarget).toBe(80);
    expect(collected).toBe(80);
  });
});
