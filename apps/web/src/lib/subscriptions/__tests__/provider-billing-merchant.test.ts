import { describe, expect, it } from "vitest";
import {
  isLivePaystackSubscription,
  paystackActivationFields,
  stripeActivationFields,
  subscriptionActivationFields,
  shouldIgnorePaystackEventForRow,
} from "@/lib/subscriptions/provider-billing-merchant";

describe("provider-billing-merchant", () => {
  it("shouldIgnorePaystackEventForRow when Apple is entitled", () => {
    expect(
      shouldIgnorePaystackEventForRow({
        billing_provider: "apple",
        status: "active",
      }),
    ).toBe(true);
  });

  it("shouldIgnorePaystackEventForRow when Stripe is merchant of record", () => {
    expect(
      shouldIgnorePaystackEventForRow({
        billing_provider: "stripe",
        status: "active",
      }),
    ).toBe(true);
  });

  it("isLivePaystackSubscription includes past_due", () => {
    expect(
      isLivePaystackSubscription({
        billing_provider: "paystack",
        status: "past_due",
        paystack_subscription_code: "SUB_1",
        plan: { is_free: false },
      }),
    ).toBe(true);
  });

  it("isLivePaystackSubscription treats active Stripe billing like Paystack for IAP block", () => {
    expect(
      isLivePaystackSubscription({
        billing_provider: "stripe",
        status: "active",
        plan: { is_free: false },
      }),
    ).toBe(true);
  });

  it("paystackActivationFields sets billing_provider", () => {
    expect(paystackActivationFields()).toMatchObject({
      billing_provider: "paystack",
      paystack_sync_pending: false,
    });
  });

  it("stripeActivationFields sets billing_provider stripe", () => {
    expect(stripeActivationFields()).toMatchObject({ billing_provider: "stripe" });
    expect(subscriptionActivationFields("stripe")).toMatchObject({ billing_provider: "stripe" });
    expect(subscriptionActivationFields("paystack")).toMatchObject({ billing_provider: "paystack" });
  });
});
