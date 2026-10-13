export type OnboardingTravelFeeTier = {
  max_km: number;
  fee: number;
};

export type OnboardingTravelFees = {
  enabled: boolean;
  use_platform_default: boolean;
  pricing_model?: "per_km" | "tiered" | null;
  rate_per_km?: number | null;
  minimum_fee?: number | null;
  maximum_fee?: number | null;
  currency?: string | null;
  free_within_km?: number | null;
  tiers?: OnboardingTravelFeeTier[] | null;
};

/** Client-only snapshot from platform-limits API; not sent on submit. */
export type PlatformTravelLimits = {
  default_rate_per_km: number;
  default_minimum_fee: number;
  default_maximum_fee: number | null;
  default_currency: string;
  provider_min_rate_per_km: number;
  provider_max_rate_per_km: number;
  provider_min_minimum_fee: number;
  provider_max_minimum_fee: number;
  allow_provider_customization: boolean;
  pricing_model?: "per_km" | "tiered";
  default_tiers?: OnboardingTravelFeeTier[] | null;
  allow_provider_tiered: boolean;
  default_free_within_km?: number;
};

export const DEFAULT_ONBOARDING_TRAVEL_FEES: OnboardingTravelFees = {
  enabled: true,
  use_platform_default: true,
};
