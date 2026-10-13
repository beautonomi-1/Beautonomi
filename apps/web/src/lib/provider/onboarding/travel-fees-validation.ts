import type {
  OnboardingTravelFees,
  PlatformTravelLimits,
} from "@/app/provider/onboarding/onboarding-travel-types";

export type TravelFeesValidationInput = {
  travel_fees?: OnboardingTravelFees | null;
  platform_travel_limits?: PlatformTravelLimits | null;
};

export function validateTravelFeesStep(input: TravelFeesValidationInput): string[] {
  const errors: string[] = [];
  const tf = input.travel_fees;
  const limits = input.platform_travel_limits;
  if (!tf || !tf.enabled || tf.use_platform_default !== false) {
    return errors;
  }

  if (tf.pricing_model === "tiered") {
    if (limits && limits.allow_provider_tiered === false) {
      errors.push(
        "Tiered travel fees are not available — use per-km pricing or platform defaults",
      );
    }
    const tiers = tf.tiers || [];
    if (tiers.length === 0) {
      errors.push("Add at least one distance tier or use platform defaults");
    } else {
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].max_km <= tiers[i - 1].max_km) {
          errors.push("Travel-fee tiers must be in ascending order by max km");
          break;
        }
      }
    }
    return errors;
  }

  if (tf.rate_per_km == null || !Number.isFinite(tf.rate_per_km) || tf.rate_per_km < 0) {
    errors.push("Enter a valid rate per km or use platform defaults");
  } else if (limits) {
    if (
      tf.rate_per_km < limits.provider_min_rate_per_km ||
      tf.rate_per_km > limits.provider_max_rate_per_km
    ) {
      errors.push(
        `Rate per km must be between ${limits.provider_min_rate_per_km} and ${limits.provider_max_rate_per_km}`,
      );
    }
  }
  if (tf.minimum_fee != null && Number.isFinite(tf.minimum_fee) && limits) {
    if (
      tf.minimum_fee < limits.provider_min_minimum_fee ||
      tf.minimum_fee > limits.provider_max_minimum_fee
    ) {
      errors.push(
        `Minimum fee must be between ${limits.provider_min_minimum_fee} and ${limits.provider_max_minimum_fee}`,
      );
    }
  }

  return errors;
}
