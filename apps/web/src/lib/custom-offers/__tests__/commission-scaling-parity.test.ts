import { describe, it, expect } from "vitest";
import { multiplyMoney } from "@beautonomi/utils";

/**
 * Mirrors Paystack + finalize-custom-offer-payment: commission base scales by collected / bookingTotal
 * (not by rawCommissionBase + travel).
 */
function scaledCommissionBase(args: {
  rawCommissionBase: number;
  bookingTotalForCommission: number;
  cashCollected: number;
  isDepositPayment: boolean;
  coTotalAmount: number;
}): number {
  const {
    rawCommissionBase,
    bookingTotalForCommission,
    cashCollected,
    isDepositPayment,
    coTotalAmount,
  } = args;
  const scaleDenom = isDepositPayment ? coTotalAmount : Math.max(0.01, bookingTotalForCommission);
  const scaleNumer = isDepositPayment ? cashCollected : Math.max(0, cashCollected);
  return scaleDenom > 0
    ? Math.max(0, multiplyMoney(rawCommissionBase, scaleNumer / scaleDenom))
    : rawCommissionBase;
}

describe("commission scaling parity (F2)", () => {
  it("uses booking total as denominator when travel is 0 (matches Paystack ratio)", () => {
    const raw = 80;
    const bookingTotal = 120; // e.g. includes tip/tax/fees beyond raw commission base
    const collected = 60;
    const got = scaledCommissionBase({
      rawCommissionBase: raw,
      bookingTotalForCommission: bookingTotal,
      cashCollected: collected,
      isDepositPayment: false,
      coTotalAmount: 0,
    });
    const paystackStyle = multiplyMoney(raw, collected / bookingTotal);
    expect(got).toBe(paystackStyle);
    expect(got).toBe(40);
  });
});
