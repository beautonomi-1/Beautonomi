import { describe, expect, it } from "vitest";
import {
  allowsInPersonProductOrderRefund,
  computeInPersonCollectibleAmount,
  computeInPersonProductOrderRefundDue,
  computeProductOrderCancelWalletCredit,
  computeProviderCollectedStoreCreditClawback,
} from "../product-order-tender";

describe("product order tender splits", () => {
  it("returns the card to the gateway and only the wallet leg on cancel", () => {
    const order = {
      total_amount: 150,
      wallet_amount: 50,
      gift_card_amount: 0,
      payment_method: "paystack",
    };
    expect(computeProductOrderCancelWalletCredit(order, 100)).toBe(50);
    expect(computeInPersonProductOrderRefundDue(order)).toBe(0);
  });

  it("falls the whole card charge back to wallet when the gateway refund fails", () => {
    const order = {
      total_amount: 150,
      wallet_amount: 50,
      gift_card_amount: 0,
      payment_method: "stripe",
    };
    expect(computeProductOrderCancelWalletCredit(order, 0)).toBe(150);
  });

  it("credits a Flutterwave order the same way as Paystack", () => {
    const order = { total_amount: 80, wallet_amount: 0, payment_method: "flutterwave" };
    expect(computeProductOrderCancelWalletCredit(order, 80)).toBe(0);
    expect(computeProductOrderCancelWalletCredit(order, 0)).toBe(80);
    expect(allowsInPersonProductOrderRefund(order)).toBe(false);
    expect(allowsInPersonProductOrderRefund({ payment_method: "card" })).toBe(false);
    expect(allowsInPersonProductOrderRefund({})).toBe(false);
  });

  it("does not wallet-credit cash the provider already collected", () => {
    const order = {
      total_amount: 150,
      wallet_amount: 40,
      gift_card_amount: 10,
      payment_method: "cash",
    };
    expect(computeProductOrderCancelWalletCredit(order, 0)).toBe(40);
    expect(computeInPersonProductOrderRefundDue(order)).toBe(100);
    expect(allowsInPersonProductOrderRefund(order)).toBe(true);
  });

  it("keeps Yoco, PayCloud, and card-on-delivery in the provider's till", () => {
    for (const payment_method of ["yoco", "paycloud", "card_on_delivery", "eft"]) {
      const order = { total_amount: 90, wallet_amount: 0, payment_method };
      expect(computeProductOrderCancelWalletCredit(order, 0)).toBe(0);
      expect(computeInPersonProductOrderRefundDue(order)).toBe(90);
    }
  });

  it("claws the provider for store credit funded by cash they kept", () => {
    const order = { total_amount: 100, wallet_amount: 40, payment_method: "cash" };
    expect(computeProviderCollectedStoreCreditClawback(order, 100)).toBe(100);
    expect(computeProviderCollectedStoreCreditClawback(order, 30)).toBe(30);
    expect(
      computeProviderCollectedStoreCreditClawback(
        { ...order, payment_method: "paystack" },
        100,
      ),
    ).toBe(0);
  });

  it("records only the in-person remainder when wallet and gift card already paid", () => {
    expect(
      computeInPersonCollectibleAmount({
        total_amount: 150,
        wallet_amount: 40,
        gift_card_amount: 10,
      }),
    ).toBe(100);
    expect(computeInPersonCollectibleAmount({ total_amount: 80 })).toBe(80);
    expect(
      computeInPersonCollectibleAmount({ total_amount: 80, wallet_amount: 80 }),
    ).toBe(0);
  });

  it("preserves the legacy remainder when the tender method was not stored", () => {
    expect(
      computeProductOrderCancelWalletCredit(
        { total_amount: 150, gift_card_amount: 0 },
        100,
      ),
    ).toBe(50);
  });
});
