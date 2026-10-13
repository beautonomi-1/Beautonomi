import { describe, expect, it } from "vitest";
import { validateTravelFeesStep } from "../travel-fees-validation";

describe("validateTravelFeesStep", () => {
  const limits = {
    default_rate_per_km: 8,
    default_minimum_fee: 20,
    default_maximum_fee: null,
    default_currency: "ZAR",
    provider_min_rate_per_km: 5,
    provider_max_rate_per_km: 50,
    provider_min_minimum_fee: 10,
    provider_max_minimum_fee: 100,
    allow_provider_customization: true,
    allow_provider_tiered: false,
  };

  it("rejects tiered pricing when platform disallows tiered", () => {
    const errors = validateTravelFeesStep({
      travel_fees: {
        enabled: true,
        use_platform_default: false,
        pricing_model: "tiered",
        tiers: [{ max_km: 10, fee: 80 }],
      },
      platform_travel_limits: limits,
    });
    expect(errors.some((e) => /tiered travel fees are not available/i.test(e))).toBe(true);
  });

  it("rejects per-km rate outside platform bounds", () => {
    const errors = validateTravelFeesStep({
      travel_fees: {
        enabled: true,
        use_platform_default: false,
        pricing_model: "per_km",
        rate_per_km: 2,
        minimum_fee: 20,
      },
      platform_travel_limits: limits,
    });
    expect(errors.some((e) => /rate per km must be between/i.test(e))).toBe(true);
  });
});
