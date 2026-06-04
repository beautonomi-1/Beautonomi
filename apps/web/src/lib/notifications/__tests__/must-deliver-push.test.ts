import { describe, expect, it } from "vitest";
import {
  isMarketingPushTemplate,
  isMustDeliverPushTemplate,
  resolvePushTemplateKey,
} from "@/lib/notifications/must-deliver-push";

describe("must-deliver-push", () => {
  it("treats booking and custom-offer keys as must-deliver", () => {
    expect(isMustDeliverPushTemplate("booking_confirmed")).toBe(true);
    expect(isMustDeliverPushTemplate("customer_custom_offer")).toBe(true);
    expect(isMustDeliverPushTemplate("provider_onboarding_welcome")).toBe(true);
    expect(isMarketingPushTemplate("customer_custom_offer")).toBe(false);
  });

  it("treats explicit and pattern-matched marketing keys as marketing", () => {
    expect(isMarketingPushTemplate("admin_broadcast")).toBe(true);
    expect(isMarketingPushTemplate("promotion_available")).toBe(true);
    expect(isMarketingPushTemplate("loyalty_reward_available")).toBe(true);
    expect(isMustDeliverPushTemplate("promotion_available")).toBe(false);
  });

  it("treats gift card and loyalty lifecycle keys as must-deliver overrides", () => {
    expect(isMustDeliverPushTemplate("gift_card_received")).toBe(true);
    expect(isMustDeliverPushTemplate("gift_card_purchased")).toBe(true);
    expect(isMustDeliverPushTemplate("loyalty_points_earned")).toBe(true);
    expect(isMarketingPushTemplate("gift_card_received")).toBe(false);
  });

  it("resolves template key from payload data", () => {
    expect(
      resolvePushTemplateKey({ template_key: "booking_confirmed" }),
    ).toBe("booking_confirmed");
    expect(resolvePushTemplateKey({ type: "custom_offer" })).toBe("custom_offer");
    expect(resolvePushTemplateKey({}, "fallback")).toBe("fallback");
    expect(resolvePushTemplateKey(null)).toBeNull();
  });
});
