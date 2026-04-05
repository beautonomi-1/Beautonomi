/**
 * Shared house-call platform zone matching for /api/location/validate and
 * calculateTravelFeeForHold. Prefer the ZA national seed zone, then other zones;
 * only consider status=active platform zones; require provider_zone_selections.
 *
 * PostGIS check_point_in_platform_zones omits radius-only zones (no geometry);
 * this JS path includes them so checkout holds stay aligned with validation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const NATIONAL_ZA_ZONE_ID = "36400000-0000-4000-8000-000000000001";

export type ProviderZoneSelectionRow = {
  id: string;
  travel_fee?: number | string;
  travel_time_minutes?: number;
};

export type PlatformZoneRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  status?: string;
  country_code?: string;
  zone_type?: string;
  postal_codes?: string[];
  cities?: string[];
  center_latitude?: unknown;
  center_longitude?: unknown;
  radius_km?: unknown;
  polygon_coordinates?: unknown;
};

export type MatchedZoneWithSelection = PlatformZoneRow & {
  provider_selection: ProviderZoneSelectionRow;
};

export type MapboxDistanceFn = {
  calculateDistance: (
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ) => number;
};

export type HouseCallServiceAddress = {
  city: string;
  postalCode: string;
  coordinates: { latitude: number; longitude: number };
};

export type MatchPlatformZoneResult = {
  hasActivePlatformZones: boolean;
  matchedPlatformZone: PlatformZoneRow | null;
  matchedZone: MatchedZoneWithSelection | null;
  anyZoneMatchedAddress: boolean;
};

function pointInPolygonRing(
  clientCoordinates: { latitude: number; longitude: number },
  polygon: unknown
): boolean {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  const ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
  type CoordInput = number[] | { lng?: number; longitude?: number; lat?: number; latitude?: number };
  const polygonCoords = ring.map((coord: CoordInput) => {
    if (Array.isArray(coord)) {
      return { longitude: coord[0], latitude: coord[1] };
    }
    return { longitude: coord.lng ?? coord.longitude ?? 0, latitude: coord.lat ?? coord.latitude ?? 0 };
  });

  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i].longitude;
    const yi = polygonCoords[i].latitude;
    const xj = polygonCoords[j].longitude;
    const yj = polygonCoords[j].latitude;

    const intersect =
      yi > clientCoordinates.latitude !== yj > clientCoordinates.latitude &&
      clientCoordinates.longitude <
        ((xj - xi) * (clientCoordinates.latitude - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

export async function matchPlatformZoneForHouseCall(
  supabase: SupabaseClient,
  mapbox: MapboxDistanceFn,
  params: { providerId: string; serviceAddress: HouseCallServiceAddress }
): Promise<MatchPlatformZoneResult> {
  const { data: platformZones } = await supabase
    .from("platform_zones")
    .select("*")
    .eq("is_active", true)
    .eq("status", "active");

  if (!platformZones?.length) {
    return {
      hasActivePlatformZones: false,
      matchedPlatformZone: null,
      matchedZone: null,
      anyZoneMatchedAddress: false,
    };
  }

  // Public booking requests run with anon/session client and can be blocked by
  // provider-only RLS on provider_zone_selections. Prefer admin client here.
  const selectionClient = (() => {
    try {
      return getSupabaseAdmin();
    } catch {
      return supabase;
    }
  })();
  const { data: providerSelections } = await selectionClient
    .from("provider_zone_selections")
    .select("*")
    .eq("provider_id", params.providerId)
    .eq("is_active", true);

  const providerSelectionsByZoneId = new Map(
    (providerSelections ?? []).map((row: Record<string, unknown>) => [String(row.platform_zone_id), row])
  );

  const { serviceAddress } = params;
  const clientCoordinates = serviceAddress.coordinates;

  const prioritizedZones = [...platformZones].sort((a: PlatformZoneRow, b: PlatformZoneRow) => {
    const aIsNational =
      a.id === NATIONAL_ZA_ZONE_ID || (a.country_code === "ZA" && a.zone_type === "radius");
    const bIsNational =
      b.id === NATIONAL_ZA_ZONE_ID || (b.country_code === "ZA" && b.zone_type === "radius");
    if (aIsNational && !bIsNational) return -1;
    if (!aIsNational && bIsNational) return 1;
    return 0;
  });

  let anyZoneMatchedAddress = false;
  let matchedPlatformZone: PlatformZoneRow | null = null;
  let matchedZone: MatchedZoneWithSelection | null = null;

  for (const zone of prioritizedZones) {
    let isInZone = false;

    if (zone.zone_type === "postal_code" && serviceAddress.postalCode) {
      const normalizedPostal = serviceAddress.postalCode.replace(/\s/g, "");
      isInZone =
        zone.postal_codes?.some((pc: string) => pc.replace(/\s/g, "") === normalizedPostal) || false;
    } else if (zone.zone_type === "city" && serviceAddress.city) {
      const normalizedCity = serviceAddress.city.toLowerCase().trim();
      isInZone =
        zone.cities?.some((c: string) => c.toLowerCase().trim() === normalizedCity) || false;
    } else if (zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
      const zoneCenter = {
        latitude: parseFloat(String(zone.center_latitude)),
        longitude: parseFloat(String(zone.center_longitude)),
      };
      const distanceToZone = mapbox.calculateDistance(zoneCenter, clientCoordinates);
      isInZone = distanceToZone <= Number(zone.radius_km);
    } else if (zone.zone_type === "polygon" && zone.polygon_coordinates) {
      isInZone = pointInPolygonRing(clientCoordinates, zone.polygon_coordinates);
    }

    if (isInZone) {
      anyZoneMatchedAddress = true;
      const zoneId = String(zone.id ?? "");
      const selection = providerSelectionsByZoneId.get(zoneId);
      if (selection) {
        matchedPlatformZone = zone;
        matchedZone = {
          ...zone,
          provider_selection: selection as ProviderZoneSelectionRow,
        };
        break;
      }
    }
  }

  return {
    hasActivePlatformZones: true,
    matchedPlatformZone,
    matchedZone,
    anyZoneMatchedAddress,
  };
}
