import type { MapboxGeocodeFeatureLike } from "@beautonomi/utils";
import { placeFieldsFromGeocodeFeature } from "@/lib/mapbox/place-fields-from-geocode";

export function trimPlaceField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function normCompare(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function coordsEqual(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
): boolean {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return false;
  return Number(aLat) === Number(bLat) && Number(aLng) === Number(bLng);
}

/** Client-sent neighborhood/metro wins; else parse geocode feature. */
export function placeFieldsForCreate(
  body: { neighborhood?: unknown; metro?: unknown },
  geocodeFeature: MapboxGeocodeFeatureLike | null,
  defaultCountryName?: string,
): { neighborhood: string | null; metro: string | null } {
  const hasNeighborhood = Object.prototype.hasOwnProperty.call(body, "neighborhood");
  const hasMetro = Object.prototype.hasOwnProperty.call(body, "metro");
  const fromClient = {
    neighborhood: hasNeighborhood ? trimPlaceField(body.neighborhood) : null,
    metro: hasMetro ? trimPlaceField(body.metro) : null,
  };
  if (fromClient.neighborhood || fromClient.metro) {
    return fromClient;
  }
  if (geocodeFeature) {
    return placeFieldsFromGeocodeFeature(geocodeFeature, defaultCountryName);
  }
  if (hasNeighborhood || hasMetro) {
    return fromClient;
  }
  return { neighborhood: null, metro: null };
}

export function applyPlaceFieldsOnPatch(
  updateData: Record<string, unknown>,
  body: Record<string, unknown>,
  existing: {
    address_line1?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    country?: string | null;
  },
  opts: {
    geocodeFeature: MapboxGeocodeFeatureLike | null;
    didRegeocode: boolean;
    finalLatitude: number | null;
    finalLongitude: number | null;
  },
): void {
  const hasNeighborhood = Object.prototype.hasOwnProperty.call(body, "neighborhood");
  const hasMetro = Object.prototype.hasOwnProperty.call(body, "metro");
  const clientNeighborhood = hasNeighborhood ? trimPlaceField(body.neighborhood) : null;
  const clientMetro = hasMetro ? trimPlaceField(body.metro) : null;
  if (clientNeighborhood || clientMetro) {
    if (hasNeighborhood) updateData.neighborhood = clientNeighborhood;
    if (hasMetro) updateData.metro = clientMetro;
    return;
  }

  if (opts.didRegeocode && opts.geocodeFeature) {
    const place = placeFieldsFromGeocodeFeature(
      opts.geocodeFeature,
      existing.country?.trim() || undefined,
    );
    updateData.neighborhood = place.neighborhood;
    updateData.metro = place.metro;
    return;
  }

  const streetChanged =
    body.address_line1 !== undefined &&
    normCompare(body.address_line1) !== normCompare(existing.address_line1);
  const cityChanged =
    body.city !== undefined && normCompare(body.city) !== normCompare(existing.city);
  const coordsInBody =
    body.latitude !== undefined || body.longitude !== undefined;
  const coordsChanged =
    coordsInBody &&
    !coordsEqual(
      body.latitude != null && String(body.latitude) !== ""
        ? parseFloat(String(body.latitude))
        : null,
      body.longitude != null && String(body.longitude) !== ""
        ? parseFloat(String(body.longitude))
        : null,
      existing.latitude,
      existing.longitude,
    );
  const geocodedCoordsChanged =
    opts.didRegeocode &&
    !coordsEqual(opts.finalLatitude, opts.finalLongitude, existing.latitude, existing.longitude);

  if (streetChanged || cityChanged || coordsChanged || geocodedCoordsChanged) {
    updateData.neighborhood = null;
    updateData.metro = null;
  }
}
