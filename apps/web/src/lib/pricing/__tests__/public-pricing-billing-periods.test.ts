import { describe, expect, it } from "vitest";
import {
  buildPublicPricingBillingPeriods,
  checkoutPriceDisplayForPeriod,
} from "../public-pricing-billing-periods";

describe("buildPublicPricingBillingPeriods", () => {
  it("includes yearly when linked price_yearly is greater than zero without Paystack yearly code", () => {
    const periods = buildPublicPricingBillingPeriods({
      isFree: false,
      paystackPlanCodeMonthly: null,
      paystackPlanCodeYearly: null,
      linkedPriceMonthly: 499,
      linkedPriceYearly: 4990,
    });
    expect(periods).toContain("monthly");
    expect(periods).toContain("yearly");
  });

  it("does not include yearly when linked price_yearly is zero", () => {
    const periods = buildPublicPricingBillingPeriods({
      isFree: false,
      paystackPlanCodeMonthly: null,
      paystackPlanCodeYearly: null,
      linkedPriceMonthly: 499,
      linkedPriceYearly: 0,
    });
    expect(periods).toEqual(["monthly"]);
  });

  it("returns empty periods for free plans", () => {
    expect(
      buildPublicPricingBillingPeriods({
        isFree: true,
        linkedPriceYearly: 999,
      }),
    ).toEqual([]);
  });
});

describe("checkoutPriceDisplayForPeriod", () => {
  it("uses linked yearly amount when billing period is yearly", () => {
    const display = checkoutPriceDisplayForPeriod(
      {
        price: "R499",
        price_monthly: 499,
        price_yearly: 4990,
        currency: "ZAR",
      },
      "yearly",
    );
    expect(display).toMatch(/4[\s,]?990|4990/);
  });
});
