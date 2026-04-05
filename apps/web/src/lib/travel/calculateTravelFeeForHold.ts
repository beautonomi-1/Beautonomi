/**
 * Compute travel fee and distance for a hold (at-home booking).
 * Used by POST /api/public/booking-holds when address has coordinates.
 * Mirrors the logic in /api/location/validate so hold checkout shows correct total.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { computeTravelFee, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";
import { matchPlatformZoneForHouseCall } from "@/lib/travel/matchPlatformZoneForHouseCall";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import { roundCurrency } from "@beautonomi/utils";

export interface HoldAddressInput {
  latitude: number;
  longitude: number;
  line1?: string;
  city?: string;
  country?: string;
  postal_code?: string;
}

export interface TravelFeeForHoldResult {
  travelFee: number;
  distanceKm: number;
  withinServiceArea: boolean;
}

export async function calculateTravelFeeForHold(
  supabase: SupabaseClient,
  providerId: string,
  address: HoldAddressInput
): Promise<TravelFeeForHoldResult> {
  const clientCoordinates = { latitude: address.latitude, longitude: address.longitude };
  const serviceAddress = {
    line1: address.line1 || "",
    city: address.city || "",
    country: address.country || HOUSE_CALL_CONFIG.DEFAULT_COUNTRY_NAME,
    postalCode: address.postal_code || "",
    coordinates: clientCoordinates,
  };

  const { data: provider } = await supabase
    .from("providers")
    .select("max_service_distance_km, is_distance_filter_enabled, offers_mobile_services")
    .eq("id", providerId)
    .single();

  if (!provider || provider.offers_mobile_services === false) {
    return { travelFee: 0, distanceKm: 0, withinServiceArea: false };
  }

  const { data: providerLocations } = await supabase
    .from("provider_locations")
    .select("id, latitude, longitude")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  if (!providerLocations?.length) {
    return { travelFee: 0, distanceKm: 0, withinServiceArea: false };
  }

  let mapbox;
  try {
    mapbox = await getMapboxService();
  } catch {
    return { travelFee: 0, distanceKm: 0, withinServiceArea: false };
  }

  type Loc = { latitude?: number | null; longitude?: number | null };
  let baseLocation: { latitude: number; longitude: number } | null = null;
  let nearestLocation = providerLocations[0] as Loc;
  let minDistance = Infinity;

  for (const loc of providerLocations as Loc[]) {
    const lat = loc.latitude ?? (loc as any).address_lat;
    const lng = loc.longitude ?? (loc as any).address_lng;
    if (lat == null || lng == null) continue;
    const dist = mapbox.calculateDistance({ latitude: lat, longitude: lng }, clientCoordinates);
    if (dist < minDistance) {
      minDistance = dist;
      nearestLocation = loc;
    }
  }

  const nlat = nearestLocation?.latitude ?? (nearestLocation as any)?.address_lat;
  const nlng = nearestLocation?.longitude ?? (nearestLocation as any)?.address_lng;
  if (nlat == null || nlng == null) {
    return { travelFee: 0, distanceKm: 0, withinServiceArea: false };
  }

  baseLocation = { latitude: nlat, longitude: nlng };

  // Prefer Mapbox driving distance when available; fallback to haversine
  let distanceKm: number;
  try {
    const route = await mapbox.calculateRoute(
      [
        { latitude: baseLocation.latitude, longitude: baseLocation.longitude },
        { latitude: clientCoordinates.latitude, longitude: clientCoordinates.longitude },
      ],
      { profile: "driving", steps: false }
    );
    distanceKm = route.distance / 1000;
  } catch {
    distanceKm = mapbox.calculateDistance(baseLocation, clientCoordinates);
  }
  const isDistanceFilterEnabled = provider.is_distance_filter_enabled === true;
  const rawMaxKm = provider.max_service_distance_km;
  const explicitMaxDistanceKm =
    rawMaxKm != null && rawMaxKm !== "" && Number.isFinite(Number(rawMaxKm))
      ? Number(rawMaxKm)
      : null;
  const maxDistanceWhenFilterOn =
    explicitMaxDistanceKm ?? HOUSE_CALL_CONFIG.DEFAULT_MAX_SERVICE_DISTANCE_KM;
  const maxRadiusKmForFeeEngine =
    explicitMaxDistanceKm != null ? explicitMaxDistanceKm : isDistanceFilterEnabled ? maxDistanceWhenFilterOn : undefined;

  let matchedZone: any = null;

  // ── 1. PostGIS platform-zone check (authoritative) ───────────────────────────────────
  // Use the check_point_in_platform_zones RPC which tests against the computed geometry
  // column built from postal-area inclusions/exclusions — the same geometry shown on the
  // admin map. This replaces the old JS polygon/postal/city matching loops.
  let ptZones: { zone_id: string; zone_name: string }[] = [];
  try {
    const { data } = await supabase.rpc("check_point_in_platform_zones", {
      p_lng: clientCoordinates.longitude,
      p_lat: clientCoordinates.latitude,
    });
    ptZones = (data ?? []) as { zone_id: string; zone_name: string }[];
  } catch {
    // RPC not available — fall through to legacy path below
  }

  const { count: platformZoneCount } = await supabase
    .from("platform_zones")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("status", "active");

  const hasPlatformZones = (platformZoneCount ?? 0) > 0;

  if (hasPlatformZones) {
    // Prefer PostGIS when geometry exists (inclusions/exclusions). Radius-only zones
    // have no geometry and never appear in ptZones — fall through to JS matcher below.
    if (ptZones.length > 0) {
      const matchedZoneIds = ptZones.map((z) => z.zone_id);
      const { data: providerSelection } = await supabase
        .from("provider_zone_selections")
        .select("*")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .in("platform_zone_id", matchedZoneIds)
        .limit(1)
        .maybeSingle();

      if (providerSelection) {
        const { data: zoneRow } = await supabase
          .from("platform_zones")
          .select("id, name")
          .eq("id", providerSelection.platform_zone_id)
          .single();
        matchedZone = { ...(zoneRow ?? {}), provider_selection: providerSelection };
      }
    }
    if (!matchedZone) {
      const jsMatch = await matchPlatformZoneForHouseCall(supabase, mapbox, {
        providerId,
        serviceAddress: {
          city: serviceAddress.city,
          postalCode: serviceAddress.postalCode,
          coordinates: clientCoordinates,
        },
      });
      if (jsMatch.matchedZone) {
        matchedZone = jsMatch.matchedZone;
      }
    }
    if (!matchedZone) {
      return { travelFee: 0, distanceKm: parseFloat(distanceKm.toFixed(2)), withinServiceArea: false };
    }
  } else {
    // ── 2. Legacy fallback — no active platform_zones in the system ──────────────────────
    const { data: serviceZones } = await supabase
      .from("service_zones")
      .select("*")
      .eq("provider_id", providerId)
      .eq("is_active", true);
    if (serviceZones?.length) {
      for (const zone of serviceZones) {
        let isInZone = false;
        if (zone.zone_type === "postal_code" && serviceAddress.postalCode) {
          isInZone = zone.postal_codes?.some((pc: string) => pc.replace(/\s/g, "") === serviceAddress.postalCode.replace(/\s/g, "")) || false;
        } else if (zone.zone_type === "city" && serviceAddress.city) {
          isInZone = zone.cities?.some((c: string) => c.toLowerCase().trim() === serviceAddress.city.toLowerCase().trim()) || false;
        }
        if (isInZone) {
          matchedZone = zone;
          break;
        }
      }
      if (!matchedZone) {
        return { travelFee: 0, distanceKm: parseFloat(distanceKm.toFixed(2)), withinServiceArea: false };
      }
    }
  }

  if (isDistanceFilterEnabled && distanceKm > maxDistanceWhenFilterOn) {
    return { travelFee: 0, distanceKm: parseFloat(distanceKm.toFixed(2)), withinServiceArea: false };
  }

  const { data: travelFeeSettings } = await supabase
    .from("provider_travel_fee_settings")
    .select("*")
    .eq("provider_id", providerId)
    .eq("enabled", true)
    .single();

  const { data: platformSettings } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .single();

  const platformTravelFees = platformSettings?.settings?.travel_fees || {
    default_rate_per_km: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM,
    default_minimum_fee: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE,
    default_maximum_fee: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE,
  };

  const usePlatformDefault = !travelFeeSettings || travelFeeSettings.use_platform_default;
  const platformModel = platformTravelFees.pricing_model ?? "per_km";
  const providerModel = travelFeeSettings?.pricing_model ?? platformModel;
  const effectiveModel = usePlatformDefault ? platformModel : providerModel;

  const platformTiers = Array.isArray(platformTravelFees.default_tiers) ? platformTravelFees.default_tiers : [];
  const providerTiers = Array.isArray(travelFeeSettings?.tiers) ? travelFeeSettings.tiers : [];
  const effectiveTiers =
    effectiveModel === "tiered"
      ? usePlatformDefault
        ? platformTiers
        : providerTiers.length > 0
          ? providerTiers
          : platformTiers
      : [];

  let travelFeeRules: TravelFeeRules;

  if (effectiveModel === "tiered" && effectiveTiers.length > 0) {
    travelFeeRules = {
      strategy: "tiered",
      tiers: effectiveTiers.map((t: { max_km: number; fee: number }) => ({
        maxDistanceKm: t.max_km,
        fee: t.fee,
        minutesPerKm: 2,
      })),
      maxRadiusKm: maxRadiusKmForFeeEngine,
      baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
      defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
    };
  } else {
    travelFeeRules = {
      strategy: "distance",
      perKmRate: usePlatformDefault ? platformTravelFees.default_rate_per_km : (travelFeeSettings?.rate_per_km ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM),
      minimumFee: usePlatformDefault ? platformTravelFees.default_minimum_fee : (travelFeeSettings?.minimum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE),
      maximumFee: usePlatformDefault ? platformTravelFees.default_maximum_fee : (travelFeeSettings?.maximum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE),
      maxRadiusKm: maxRadiusKmForFeeEngine,
      baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
      defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
    };
  }

  const travelFeeResult = computeTravelFee(baseLocation, serviceAddress, travelFeeRules, {
    overrideDistanceKm: distanceKm,
  });
  if (!travelFeeResult.withinServiceArea) {
    return {
      travelFee: 0,
      distanceKm: travelFeeResult.distanceKm ?? parseFloat(distanceKm.toFixed(2)),
      withinServiceArea: false,
    };
  }

  let finalTravelFee = travelFeeResult.fee;
  // Only override with the zone flat rate when it's explicitly set (non-null).
  // NULL travel_fee means "use the rate engine" — set when a provider is auto-enrolled.
  if (matchedZone?.provider_selection?.travel_fee != null) {
    finalTravelFee = parseFloat(matchedZone.provider_selection.travel_fee.toString());
  } else if (matchedZone?.travel_fee != null) {
    finalTravelFee = parseFloat(matchedZone.travel_fee.toString());
  }

  return {
    travelFee: roundCurrency(finalTravelFee),
    distanceKm: parseFloat((travelFeeResult.distanceKm ?? distanceKm).toFixed(2)),
    withinServiceArea: true,
  };
}
