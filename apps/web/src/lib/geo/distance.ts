/**
 * Shared geographic distance utilities.
 * Single source of truth for straight-line (Haversine) distance so provider cards,
 * provider details, travel fee, and house-call logic all use the same calculation.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Haversine distance between two points in kilometers.
 * Used consistently for: provider card/detail distance, travel fee, service area checks.
 * For driving distance/duration use Mapbox Directions (e.g. getMapboxService().calculateRoute).
 */
export function haversineDistanceKm(
  from: LatLng,
  to: LatLng
): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Same as haversineDistanceKm but with separate lat/lng args (for callers that have scalars).
 */
export function haversineDistanceKmFromCoords(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return haversineDistanceKm(
    { latitude: lat1, longitude: lng1 },
    { latitude: lat2, longitude: lng2 }
  );
}
