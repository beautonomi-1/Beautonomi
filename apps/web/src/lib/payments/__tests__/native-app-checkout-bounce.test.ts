import {
  resolveCustomerNativeBouncePath,
  resolveProviderNativeBouncePath,
} from "../native-app-checkout-bounce";

import { describe, it, expect } from "vitest";

describe("native-app-checkout-bounce", () => {
  it("bounces checkout success to book/paystack with full query", () => {
    const params = new URLSearchParams(
      "booking_id=b1&reference=ref1&trxref=ref1&session_id=sess1&context=app",
    );
    const target = resolveCustomerNativeBouncePath("/checkout/success", params);
    expect(target).toMatch(/^customer:\/\/book\/paystack\?/);
    expect(target).toContain("reference=ref1");
    expect(target).toContain("session_id=sess1");
    expect(target).not.toContain("context=app");
  });

  it("bounces membership success to membership-paystack", () => {
    const params = new URLSearchParams("payment_type=membership&reference=r1&context=app");
    const target = resolveCustomerNativeBouncePath("/checkout/success", params);
    expect(target).toMatch(/^customer:\/\/membership-paystack\?/);
  });

  it("bounces shop payment callback", () => {
    const params = new URLSearchParams("order_id=o1&context=app");
    const target = resolveCustomerNativeBouncePath("/shop/payment-callback", params);
    expect(target).toMatch(/^customer:\/\/shop\/paystack\?/);
  });

  it("bounces shop cancelled to shop/paystack", () => {
    const params = new URLSearchParams("order_id=o1&context=app");
    const target = resolveCustomerNativeBouncePath("/shop/cancelled", params);
    expect(target).toMatch(/^customer:\/\/shop\/paystack\?/);
  });

  it("bounces wallet top-up cancel on checkout/cancelled", () => {
    const params = new URLSearchParams("payment_type=wallet_topup&topup_cancelled=1&context=app");
    const target = resolveCustomerNativeBouncePath("/checkout/cancelled", params);
    expect(target).toMatch(/^customer:\/\/wallet-return\?/);
  });

  it("bounces account-settings/wallet cancel to wallet-return", () => {
    const params = new URLSearchParams("payment_type=wallet_topup&topup_cancelled=1&context=app");
    const target = resolveCustomerNativeBouncePath("/account-settings/wallet", params);
    expect(target).toMatch(/^customer:\/\/wallet-return\?/);
  });

  it("bounces booking payment callback with booking_id", () => {
    const params = new URLSearchParams("reference=r2&context=app");
    const target = resolveCustomerNativeBouncePath(
      "/account-settings/bookings/b99/payment-callback",
      params,
    );
    expect(target).toContain("customer://book/paystack");
    expect(target).toContain("booking_id=b99");
  });

  it("bounces provider subscription when in_app", () => {
    const params = new URLSearchParams("payment_success=true&order_id=o1&in_app=1");
    const target = resolveProviderNativeBouncePath("/provider/subscription", params);
    expect(target).toMatch(/^provider:\/\/settings\/subscription-payment-return\?/);
  });

  it("returns null without app context", () => {
    const params = new URLSearchParams("reference=r1");
    expect(resolveCustomerNativeBouncePath("/checkout/success", params)).toBeNull();
  });
});
