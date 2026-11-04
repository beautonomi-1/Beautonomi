import { describe, expect, it } from "vitest";
import {
  allocateCheckoutGift,
  applyCheckoutBillAdjustment,
  giftRedemptionCreditDecision,
} from "../checkout-bill-adjustment";

describe("applyCheckoutBillAdjustment", () => {
  it("adds a tip and subtracts a till discount from the amount already owed", () => {
    expect(
      applyCheckoutBillAdjustment({
        totalAmount: 165,
        tipAmount: 0,
        discountAmount: 0,
        checkoutTip: 10,
        checkoutDiscount: 20,
      }),
    ).toEqual({ totalAmount: 155, tipAmount: 10, discountAmount: 20 });
  });

  it("puts the booking back when a card-machine charge is cancelled", () => {
    const adjusted = applyCheckoutBillAdjustment({
      totalAmount: 165,
      tipAmount: 0,
      discountAmount: 0,
      checkoutTip: 10,
      checkoutDiscount: 20,
    });
    expect(
      applyCheckoutBillAdjustment({
        ...adjusted,
        checkoutTip: 10,
        checkoutDiscount: 20,
        revert: true,
      }),
    ).toEqual({ totalAmount: 165, tipAmount: 0, discountAmount: 0 });
  });

  it("does not let a discount take the total below zero", () => {
    expect(
      applyCheckoutBillAdjustment({
        totalAmount: 50,
        tipAmount: 5,
        discountAmount: 0,
        checkoutTip: 0,
        checkoutDiscount: 80,
      }).totalAmount,
    ).toBe(0);
  });
});

describe("giftRedemptionCreditDecision", () => {
  it("credits a new hold", () => {
    expect(
      giftRedemptionCreditDecision({
        remainingBalance: 40,
        redemptionAmount: 50,
        redemptionStatus: "reserved",
        giftApply: 50,
        existingCheckoutPayment: false,
        recordedGiftPayments: 0,
      }),
    ).toBe("credit");
  });

  it("does not credit a second gift when the booking already has a redemption", () => {
    expect(
      giftRedemptionCreditDecision({
        remainingBalance: null,
        redemptionAmount: 50,
        redemptionStatus: "captured",
        giftApply: 80,
        existingCheckoutPayment: false,
        recordedGiftPayments: 50,
      }),
    ).toBe("reject");
  });

  it("does not credit the same gift again while a hold is still pending", () => {
    expect(
      giftRedemptionCreditDecision({
        remainingBalance: null,
        redemptionAmount: 50,
        redemptionStatus: "reserved",
        giftApply: 50,
        existingCheckoutPayment: false,
        recordedGiftPayments: 50,
      }),
    ).toBe("reject");
  });

  it("records the payment once when the same hold is retried before the payment row exists", () => {
    expect(
      giftRedemptionCreditDecision({
        remainingBalance: null,
        redemptionAmount: 50,
        redemptionStatus: "captured",
        giftApply: 50,
        existingCheckoutPayment: false,
        recordedGiftPayments: 0,
      }),
    ).toBe("credit");
  });
});

describe("allocateCheckoutGift", () => {
  it("keeps a deposit and spends the gift on the balance before the tip", () => {
    expect(allocateCheckoutGift({ owedBase: 115, checkoutTip: 10, giftRequested: 50 })).toEqual({
      giftBase: 50,
      giftTip: 0,
    });
  });

  it("lets a gift card that covers the whole bill pay the tip as well", () => {
    expect(allocateCheckoutGift({ owedBase: 165, checkoutTip: 10, giftRequested: 175 })).toEqual({
      giftBase: 165,
      giftTip: 10,
    });
  });
});
