import { describe, expect, it } from "vitest";
import {
  isLivePaystackSubscription,
  paystackActivationFields,
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

  it("paystackActivationFields sets billing_provider", () => {
    expect(paystackActivationFields()).toMatchObject({
      billing_provider: "paystack",
      paystack_sync_pending: false,
    });
  });
});
