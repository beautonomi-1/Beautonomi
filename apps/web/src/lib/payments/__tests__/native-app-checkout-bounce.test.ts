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

  it("marks booking checkout/cancelled bounce with cancelled=1", () => {
    const params = new URLSearchParams("booking_id=b1&booking_number=BK1&context=app");
    const target = resolveCustomerNativeBouncePath("/checkout/cancelled", params)!;
    expect(target).toMatch(/^customer:\/\/book\/paystack\?/);
    const q = new URL(target).searchParams;
    expect(q.get("cancelled")).toBe("1");
    expect(q.get("booking_id")).toBe("b1");
  });

  it("marks custom offer and membership cancels with cancelled=1", () => {
    const offer = resolveCustomerNativeBouncePath(
      "/checkout/cancelled",
      new URLSearchParams("payment_type=custom_offer&offer_id=o1&context=app"),
    )!;
    expect(offer).toMatch(/^customer:\/\/custom-offer-paystack\?/);
    expect(new URL(offer).searchParams.get("cancelled")).toBe("1");

    const membership = resolveCustomerNativeBouncePath(
      "/checkout/cancelled",
      new URLSearchParams("payment_type=membership&membership_cancelled=1&context=app"),
    )!;
    expect(membership).toMatch(/^customer:\/\/membership-paystack\?/);
    expect(new URL(membership).searchParams.get("cancelled")).toBe("1");
  });

  it("does not mark successful checkout as cancelled", () => {
    const target = resolveCustomerNativeBouncePath(
      "/checkout/success",
      new URLSearchParams("booking_id=b1&reference=r1&context=app"),
    )!;
    expect(new URL(target).searchParams.get("cancelled")).toBeNull();
  });

  it("marks Flutterwave status=cancelled on success landing as cancelled", () => {
    const target = resolveCustomerNativeBouncePath(
      "/checkout/success",
      new URLSearchParams("booking_id=b1&status=cancelled&tx_ref=t1&context=app"),
    )!;
    expect(new URL(target).searchParams.get("cancelled")).toBe("1");
  });

  it("normalizes wallet topup_cancelled to cancelled=1", () => {
    const target = resolveCustomerNativeBouncePath(
      "/account-settings/wallet",
      new URLSearchParams("topup_cancelled=1&context=app"),
    )!;
    expect(new URL(target).searchParams.get("cancelled")).toBe("1");
  });

  it("bounces gift card purchase cancel to gift-card-return", () => {
    const target = resolveCustomerNativeBouncePath(
      "/gift-card/purchase/cancelled",
      new URLSearchParams("context=app"),
    )!;
    expect(target).toMatch(/^customer:\/\/gift-card-return\?/);
    expect(new URL(target).searchParams.get("cancelled")).toBe("1");
  });

  it("bounces pay-remaining and additional-charge cancels on booking detail", () => {
    const remaining = resolveCustomerNativeBouncePath(
      "/account-settings/bookings/b42",
      new URLSearchParams("pay_remaining=1&context=app&pay_remaining_cancelled=1"),
    )!;
    expect(remaining).toMatch(/^customer:\/\/book\/paystack\?/);
    const rq = new URL(remaining).searchParams;
    expect(rq.get("booking_id")).toBe("b42");
    expect(rq.get("cancelled")).toBe("1");

    const charge = resolveCustomerNativeBouncePath(
      "/account-settings/bookings/b42",
      new URLSearchParams("context=app&charge_cancelled=1&charge_id=c1"),
    )!;
    expect(new URL(charge).searchParams.get("cancelled")).toBe("1");
  });

  it("does not bounce booking detail without a cancel marker", () => {
    expect(
      resolveCustomerNativeBouncePath("/account-settings/bookings/b42", new URLSearchParams("context=app")),
    ).toBeNull();
  });

  it("bounces provider marketing top-up cancel", () => {
    const target = resolveProviderNativeBouncePath(
      "/provider/settings/marketing-integrations",
      new URLSearchParams("in_app=1&payment_type=marketing_topup&context=app&topup_cancelled=1"),
    );
    expect(target).toMatch(/^provider:\/\/settings\/marketing-integrations\?/);
    expect(target).toContain("topup_cancelled=1");
  });

  it("returns null without app context", () => {
    const params = new URLSearchParams("reference=r1");
    expect(resolveCustomerNativeBouncePath("/checkout/success", params)).toBeNull();
  });
});
