import { describe, expect, it } from "vitest";
import {
  computeCancellationFeeForSettlement,
  computeEffectiveCollectedAmount,
  computeReconciledCancellationAmounts,
  computeYocoTerminalRefundDue,
} from "../settle-booking-cancellation";

describe("computeYocoTerminalRefundDue", () => {
  it("caps at Yoco captures and ignores other rails and failed rows", () => {
    expect(
      computeYocoTerminalRefundDue(
        [
          { payment_provider: "yoco", status: "completed", amount: 150 },
          { payment_provider: "yoco", status: "failed", amount: 500 },
          { payment_provider: "paystack", status: "completed", amount: 100 },
        ],
        200,
      ),
    ).toBe(150);
  });

  it("never exceeds the in-person candidate", () => {
    expect(
      computeYocoTerminalRefundDue([{ payment_provider: "YOCO", status: "completed", amount: "300" }], 120),
    ).toBe(120);
  });

  it("is zero without Yoco captures", () => {
    expect(computeYocoTerminalRefundDue([{ payment_provider: "paycloud", status: "completed", amount: 80 }], 80)).toBe(0);
  });
});

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
    const { walletRefundAmount } = computeReconciledCancellationAmounts({
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
    expect(walletRefundAmount).toBe(80);
  });

  it("excludes gift-card leg from wallet refund when full refund will restore the card", () => {
    const booking = {
      id: "b1",
      provider_id: "p1",
      total_amount: 100,
      total_paid: 100,
      wallet_amount: 0,
      gift_card_amount: 40,
      total_refunded: 0,
    };
    const { walletRefundAmount, cancellationFeeApplied } = computeReconciledCancellationAmounts({
      booking,
      cancelledBy: "provider",
      currency: "ZAR",
      policy: null,
    });
    // R40 restored to gift card + R60 to wallet = R100 total restitution, no double-pay.
    expect(walletRefundAmount).toBe(60);
    expect(cancellationFeeApplied).toBe(0);
  });

  it("excludes tip from cancellation fee basis on customer cancel", () => {
    const booking = {
      id: "b1",
      provider_id: "p1",
      total_amount: 120,
      tip_amount: 20,
      total_paid: 100,
      wallet_amount: 0,
      gift_card_amount: 0,
      total_refunded: 0,
    };
    const { cancellationFeeApplied, walletRefundAmount } = computeReconciledCancellationAmounts({
      booking,
      cancelledBy: "customer",
      currency: "ZAR",
      policy: {
        id: "p1",
        name: "Strict",
        hours_before: 24,
        refund_percentage: 0,
        fee_amount: 0,
        fee_type: "fixed",
        is_default: true,
        late_cancellation_type: "no_refund",
      },
      isLateCancellation: true,
      refundBookingTotal: 120,
    });
    expect(walletRefundAmount).toBe(0);
    expect(cancellationFeeApplied).toBe(100);
  });

  it("caps cancellation fee to collected minus wallet refund on deposit bookings", () => {
    const booking = {
      id: "b1",
      provider_id: "p1",
      total_amount: 200,
      total_paid: 60,
      wallet_amount: 0,
      gift_card_amount: 0,
      total_refunded: 0,
    };
    const { cancellationFeeApplied, walletRefundAmount } = computeReconciledCancellationAmounts({
      booking,
      cancelledBy: "customer",
      currency: "ZAR",
      policy: {
        id: "p1",
        name: "Strict",
        hours_before: 24,
        refund_percentage: 0,
        fee_amount: 0,
        fee_type: "fixed",
        is_default: true,
        late_cancellation_type: "no_refund",
      },
      isLateCancellation: true,
    });
    expect(walletRefundAmount).toBe(0);
    expect(cancellationFeeApplied).toBe(60);
  });

  it("walletStoreCreditAmountWhenVoidingGiftOnFullRefund excludes gift leg on full refund", async () => {
    const { walletStoreCreditAmountWhenVoidingGiftOnFullRefund } = await import(
      "../settle-booking-cancellation"
    );
    expect(
      walletStoreCreditAmountWhenVoidingGiftOnFullRefund({
        refundAmount: 200,
        giftCardCollected: 50,
        totalRefundedBefore: 0,
        totalCollectedAllSources: 200,
      }),
    ).toBe(150);
    expect(
      walletStoreCreditAmountWhenVoidingGiftOnFullRefund({
        refundAmount: 80,
        giftCardCollected: 50,
        totalRefundedBefore: 0,
        totalCollectedAllSources: 200,
      }),
    ).toBe(80);
  });

  it("admin cancel defaults to full refund and zero fee", () => {
    const result = computeCancellationFeeForSettlement({
      booking: { id: "b1", provider_id: "p1", total_amount: 200 },
      cancelledBy: "admin",
      currency: "ZAR",
      policy: null,
    });
    expect(result.cancellationFeeApplied).toBe(0);
    expect(result.policyRefundAmount).toBe(200);
  });
});
