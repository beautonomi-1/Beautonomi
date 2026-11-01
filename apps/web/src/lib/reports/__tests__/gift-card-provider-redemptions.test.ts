import { describe, expect, it } from "vitest";
import { giftCardCapturePeriodBounds } from "../gift-card-provider-redemptions";

describe("giftCardCapturePeriodBounds", () => {
  it("today is a full civil day in the provider timezone", () => {
    const tz = "Africa/Johannesburg";
    const { fromDate, toDate, fromYmd, toYmd } = giftCardCapturePeriodBounds("today", tz);
    expect(fromYmd).toBe(toYmd);
    expect(toDate.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it("week is trailing 7 days not empty same instant", () => {
    const tz = "Africa/Johannesburg";
    const { fromYmd, toYmd } = giftCardCapturePeriodBounds("week", tz);
    expect(fromYmd).not.toBe(toYmd);
  });
});
