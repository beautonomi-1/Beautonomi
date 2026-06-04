import { validateStep } from "@/features/provider-onboarding/validation";

describe("validateStep travel fees (step 10)", () => {
  const limits = {
    provider_min_rate_per_km: 5,
    provider_max_rate_per_km: 50,
    provider_min_minimum_fee: 10,
    provider_max_minimum_fee: 100,
    allow_provider_customization: true,
    allow_provider_tiered: false,
  };

  it("rejects tiered pricing when platform disallows tiered", () => {
    const result = validateStep(10, {
      travel_fees: {
        enabled: true,
        use_platform_default: false,
        pricing_model: "tiered",
        tiers: [{ max_km: 10, fee: 80 }],
      },
      platform_travel_limits: limits,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /tiered travel fees are not available/i.test(e))).toBe(true);
  });

  it("rejects per-km rate outside platform bounds", () => {
    const result = validateStep(10, {
      travel_fees: {
        enabled: true,
        use_platform_default: false,
        pricing_model: "per_km",
        rate_per_km: 2,
        minimum_fee: 20,
      },
      platform_travel_limits: limits,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /rate per km must be between/i.test(e))).toBe(true);
  });
});
