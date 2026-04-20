/**
 * Shared construction of TravelFeeRules for at-home (house call) pricing.
 * Used by booking holds, location validation, and any path that must match checkout totals.
 */
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import type { TravelFeeRules } from "@/lib/travel/travelFeeEngine";

type TierRow = { max_km: number; fee: number };

export function buildAtHomeTravelFeeRules(
  platformTravelFees: Record<string, unknown>,
  travelFeeSettings: Record<string, unknown> | null,
  maxRadiusKmForFeeEngine?: number
): TravelFeeRules {
  // Match legacy callers: only explicit truthy use_platform_default opts into platform rates when a row exists.
  const usePlatformDefault =
    !travelFeeSettings || Boolean(travelFeeSettings.use_platform_default);

  const platformModel = (platformTravelFees.pricing_model as string | undefined) ?? "per_km";
  const providerModel = (travelFeeSettings?.pricing_model as string | null | undefined) ?? platformModel;
  const effectiveModel = usePlatformDefault ? platformModel : providerModel;

  const platformTiers = Array.isArray(platformTravelFees.default_tiers)
    ? (platformTravelFees.default_tiers as TierRow[])
    : [];
  const providerTiers = Array.isArray(travelFeeSettings?.tiers)
    ? (travelFeeSettings?.tiers as TierRow[])
    : [];
  const effectiveTiers =
    effectiveModel === "tiered"
      ? usePlatformDefault
        ? platformTiers
        : providerTiers.length > 0
          ? providerTiers
          : platformTiers
      : [];

  if (effectiveModel === "tiered" && effectiveTiers.length > 0) {
    return {
      strategy: "tiered",
      tiers: effectiveTiers.map((t) => ({
        maxDistanceKm: t.max_km,
        fee: t.fee,
        minutesPerKm: 2,
      })),
      maxRadiusKm: maxRadiusKmForFeeEngine,
      baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
      defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
    };
  }

  const platformFreeRaw = platformTravelFees.default_free_within_km;
  const platformFree =
    platformFreeRaw != null && platformFreeRaw !== ""
      ? Number(platformFreeRaw)
      : 0;
  const providerFreeRaw = travelFeeSettings?.free_within_km;
  const providerFree =
    providerFreeRaw != null && providerFreeRaw !== "" ? Number(providerFreeRaw) : 0;
  const effectiveFreeKm = usePlatformDefault ? platformFree : providerFree;

  return {
    strategy: "distance",
    perKmRate: usePlatformDefault
      ? Number(
          platformTravelFees.default_rate_per_km ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM
        )
      : Number(
          travelFeeSettings?.rate_per_km ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM
        ),
    minimumFee: usePlatformDefault
      ? Number(
          platformTravelFees.default_minimum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE
        )
      : Number(
          travelFeeSettings?.minimum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE
        ),
    maximumFee: usePlatformDefault
      ? (platformTravelFees.default_maximum_fee as number | null | undefined) ??
        HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE
      : (travelFeeSettings?.maximum_fee as number | null | undefined) ??
        HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE,
    freeRadiusKm: effectiveFreeKm > 0 ? effectiveFreeKm : undefined,
    maxRadiusKm: maxRadiusKmForFeeEngine,
    baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
    defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
  };
}
