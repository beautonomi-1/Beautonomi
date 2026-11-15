import { describe, expect, it } from "vitest";
import { subscriptionPeriodAlreadyOpen } from "../provider-billing-merchant";

describe("subscriptionPeriodAlreadyOpen", () => {
  const now = Date.parse("2026-11-14T00:00:00.000Z");

  it("treats an active future period as open and a lapsed one as ready for a new purchase", () => {
    expect(subscriptionPeriodAlreadyOpen("active", "2026-12-01T00:00:00.000Z", now)).toBe(true);
    expect(subscriptionPeriodAlreadyOpen("active", "2026-11-01T00:00:00.000Z", now)).toBe(false);
    expect(subscriptionPeriodAlreadyOpen("active", null, now)).toBe(false);
    expect(subscriptionPeriodAlreadyOpen("past_due", "2026-12-01T00:00:00.000Z", now)).toBe(false);
    expect(subscriptionPeriodAlreadyOpen("paid", "2026-12-01T00:00:00.000Z", now)).toBe(false);
  });
});
