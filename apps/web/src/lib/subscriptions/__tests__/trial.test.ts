import { describe, expect, it } from "vitest";
import {
  computeTrialEndsAt,
  DEFAULT_PROVIDER_TRIAL_DAYS,
  isPaidToPaidDowngrade,
  planPriceForPeriod,
} from "../trial";

describe("computeTrialEndsAt", () => {
  it("adds the requested number of UTC days", () => {
    const from = new Date("2026-09-02T10:00:00.000Z");
    expect(computeTrialEndsAt(from, 14)).toBe("2026-09-16T10:00:00.000Z");
  });

  it("falls back to the default when trialDays is invalid", () => {
    const from = new Date("2026-09-02T00:00:00.000Z");
    const expected = computeTrialEndsAt(from, DEFAULT_PROVIDER_TRIAL_DAYS);
    expect(computeTrialEndsAt(from, 0)).toBe(expected);
    expect(computeTrialEndsAt(from, -3)).toBe(expected);
  });
});

describe("isPaidToPaidDowngrade", () => {
  it("is true when the next paid plan is cheaper", () => {
    expect(
      isPaidToPaidDowngrade(
        { price_monthly: 499, price_yearly: 4990 },
        { price_monthly: 299, price_yearly: 2990 },
        "monthly",
      ),
    ).toBe(true);
  });

  it("is false for upgrades and free targets", () => {
    expect(
      isPaidToPaidDowngrade(
        { price_monthly: 299, price_yearly: 2990 },
        { price_monthly: 499, price_yearly: 4990 },
        "monthly",
      ),
    ).toBe(false);
    expect(
      isPaidToPaidDowngrade(
        { price_monthly: 499, price_yearly: 4990 },
        { price_monthly: 0, price_yearly: 0 },
        "monthly",
      ),
    ).toBe(false);
  });

  it("compares yearly prices when the period is yearly", () => {
    expect(planPriceForPeriod({ price_monthly: 100, price_yearly: 1000 }, "yearly")).toBe(1000);
    expect(
      isPaidToPaidDowngrade(
        { price_monthly: 100, price_yearly: 1200 },
        { price_monthly: 90, price_yearly: 800 },
        "yearly",
      ),
    ).toBe(true);
  });
});
