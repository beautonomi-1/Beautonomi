import type { PlatformTravelLimits } from "@/app/provider/onboarding/onboarding-travel-types";

export function formatPlatformTravelDefaultsSummary(
  limits: PlatformTravelLimits | null | undefined,
  currencyFallback = "ZAR",
): string {
  if (!limits) return "";
  const currency = limits.default_currency || currencyFallback;
  const rate = limits.default_rate_per_km;
  const min = limits.default_minimum_fee;
  const max =
    limits.default_maximum_fee != null ? String(limits.default_maximum_fee) : "—";
  const freeKm = limits.default_free_within_km ?? 0;
  return `${currency} ${rate}/km · min ${currency} ${min} · max ${max} · free within ${freeKm} km`;
}
