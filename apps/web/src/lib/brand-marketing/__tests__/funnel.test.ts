import { describe, expect, it } from "vitest";
import { buildDemandFunnel, buildSupplyFunnel, rateBetween } from "../funnel";

describe("brand funnel", () => {
  it("rateBetween handles zero prior", () => {
    expect(rateBetween(10, 0)).toBeNull();
    expect(rateBetween(5, 10)).toBe(50);
  });

  it("buildDemandFunnel includes signup and booking steps", () => {
    const steps = buildDemandFunnel({
      trackingCode: "test-za",
      measured: {
        signups: 20,
        promo_redemptions: 4,
        promo_discount: 0,
        promo_booking_value: 100,
        attributed_booking_value: 50,
        coupon_redeems: 0,
        referral_completions: 0,
        referral_rewards: 0,
        ads_clicks: 30,
        broadcast_recipients: 0,
        waitlist_rows: 0,
        leads_created: 0,
        leads_won: 0,
      },
      enteredReach: 1000,
      enteredClicks: 100,
    });
    expect(steps.find((s) => s.id === "signup")?.value).toBe(20);
    expect(steps.find((s) => s.id === "booking")?.value).toBe(4);
    expect(steps.find((s) => s.id === "response")?.value).toBe(130);
  });

  it("buildSupplyFunnel uses leads", () => {
    const steps = buildSupplyFunnel({
      measured: {
        signups: 0,
        promo_redemptions: 0,
        promo_discount: 0,
        promo_booking_value: 0,
        attributed_booking_value: 0,
        coupon_redeems: 0,
        referral_completions: 0,
        referral_rewards: 0,
        ads_clicks: 0,
        broadcast_recipients: 0,
        waitlist_rows: 0,
        leads_created: 10,
        leads_won: 3,
      },
    });
    expect(steps[0].value).toBe(10);
    expect(steps[1].value).toBe(3);
  });
});
