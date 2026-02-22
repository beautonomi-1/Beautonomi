/**
 * Compute travel fee and distance for a hold (at-home booking).
 * Used by POST /api/public/booking-holds when address has coordinates.
 * Mirrors the logic in /api/location/validate so hold checkout shows correct total.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { computeTravelFee, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";

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

  const distanceKm = mapbox.calculateDistance(baseLocation, clientCoordinates);
  const maxDistance = provider.max_service_distance_km || HOUSE_CALL_CONFIG.DEFAULT_MAX_SERVICE_DISTANCE_KM;
  const isDistanceFilterEnabled = provider.is_distance_filter_enabled || false;

  let matchedZone: any = null;
  const { data: platformZones } = await supabase
    .from("platform_zones")
    .select("*")
    .eq("is_active", true);

  if (platformZones && platformZones.length > 0) {
    for (const zone of platformZones) {
      let isInZone = false;
      if (zone.zone_type === "postal_code" && serviceAddress.postalCode) {
        const normalizedPostal = serviceAddress.postalCode.replace(/\s/g, "");
        isInZone = zone.postal_codes?.some((pc: string) => pc.replace(/\s/g, "") === normalizedPostal) || false;
      } else if (zone.zone_type === "city" && serviceAddress.city) {
        const normalizedCity = serviceAddress.city.toLowerCase().trim();
        isInZone = zone.cities?.some((c: string) => c.toLowerCase().trim() === normalizedCity) || false;
      } else if (zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
        const zoneCenter = {
          latitude: parseFloat(zone.center_latitude.toString()),
          longitude: parseFloat(zone.center_longitude.toString()),
        };
        isInZone = mapbox.calculateDistance(zoneCenter, clientCoordinates) <= zone.radius_km;
      } else if (zone.zone_type === "polygon" && zone.polygon_coordinates) {
        const polygon = zone.polygon_coordinates;
        if (Array.isArray(polygon) && polygon.length > 0) {
          const ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
          const polygonCoords = ring.map((coord: any) => ({
            longitude: Array.isArray(coord) ? coord[0] : (coord.lng ?? coord.longitude),
            latitude: Array.isArray(coord) ? coord[1] : (coord.lat ?? coord.latitude),
          }));
          let inside = false;
          for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
            const xi = polygonCoords[i].longitude, yi = polygonCoords[i].latitude;
            const xj = polygonCoords[j].longitude, yj = polygonCoords[j].latitude;
            const intersect =
              yi > clientCoordinates.latitude !== yj > clientCoordinates.latitude &&
              clientCoordinates.longitude < ((xj - xi) * (clientCoordinates.latitude - yi)) / (yj - yi) + xi;
            if (intersect) inside = !inside;
          }
          isInZone = inside;
        }
      }
      if (isInZone) {
        const { data: providerSelection } = await supabase
          .from("provider_zone_selections")
          .select("*")
          .eq("provider_id", providerId)
          .eq("platform_zone_id", zone.id)
          .eq("is_active", true)
          .single();
        if (providerSelection) {
          matchedZone = { ...zone, provider_selection: providerSelection };
          break;
        }
      }
    }
    if (!matchedZone && platformZones.length > 0) {
      return { travelFee: 0, distanceKm: parseFloat(distanceKm.toFixed(2)), withinServiceArea: false };
    }
  } else {
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

  if (isDistanceFilterEnabled && distanceKm > maxDistance) {
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
  const travelFeeRules: TravelFeeRules = {
    strategy: "distance",
    perKmRate: usePlatformDefault ? platformTravelFees.default_rate_per_km : (travelFeeSettings?.rate_per_km ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM),
    minimumFee: usePlatformDefault ? platformTravelFees.default_minimum_fee : (travelFeeSettings?.minimum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE),
    maximumFee: usePlatformDefault ? platformTravelFees.default_maximum_fee : (travelFeeSettings?.maximum_fee ?? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE),
    maxRadiusKm: maxDistance,
    baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
    defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
  };

  const travelFeeResult = computeTravelFee(baseLocation, serviceAddress, travelFeeRules);
  if (!travelFeeResult.withinServiceArea) {
    return {
      travelFee: 0,
      distanceKm: travelFeeResult.distanceKm ?? parseFloat(distanceKm.toFixed(2)),
      withinServiceArea: false,
    };
  }

  let finalTravelFee = travelFeeResult.fee;
  if (matchedZone?.provider_selection) {
    finalTravelFee = parseFloat(matchedZone.provider_selection.travel_fee.toString());
  } else if (matchedZone?.travel_fee != null) {
    finalTravelFee = parseFloat(matchedZone.travel_fee.toString());
  }

  return {
    travelFee: Math.round(finalTravelFee * 100) / 100,
    distanceKm: parseFloat((travelFeeResult.distanceKm ?? distanceKm).toFixed(2)),
    withinServiceArea: true,
  };
}
