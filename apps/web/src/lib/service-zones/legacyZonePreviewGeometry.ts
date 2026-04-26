/**
 * Preview geometry for legacy `platform_zones` rows (radius / JSON polygon) that do not have
 * `geometry` populated by the PostGIS inclusion pipeline. Used by admin map-layers and zone GET
 * so operators see coverage on the map (e.g. migration 364 South Africa national radius seed).
 */

export type LegacyZoneRow = {
  zone_type?: string | null;
  center_longitude?: number | string | null;
  center_latitude?: number | string | null;
  radius_km?: number | string | null;
  polygon_coordinates?: unknown;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Great-circle destination (WGS84). Bearing in degrees, distance in km. */
function destinationLngLat(lng: number, lat: number, bearingDeg: number, distanceKm: number): [number, number] {
  const R = 6371;
  const δ = distanceKm / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

/** Closed polygon approximating a circle on the spheroid (good enough for admin preview). */
export function legacyRadiusCoveragePolygon(
  centerLng: number,
  centerLat: number,
  radiusKm: number,
  segments = 96,
): GeoJSON.Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (360 * i) / segments;
    ring.push(destinationLngLat(centerLng, centerLat, bearing, radiusKm));
  }
  return { type: "Polygon", coordinates: [ring] };
}

/** Bbox [minLng, minLat, maxLng, maxLat] from a ring of [lng, lat] pairs. */
export function bboxFromLngLatRing(ring: [number, number][]): [number, number, number, number] | null {
  if (!ring.length) return null;
  let minLng = ring[0][0];
  let maxLng = ring[0][0];
  let minLat = ring[0][1];
  let maxLat = ring[0][1];
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Ring points already in GeoJSON order [lng, lat]. */
function ringLngLatGeoJson(ring: unknown[]): [number, number][] | null {
  const pts: [number, number][] = [];
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lng = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    pts.push([lng, lat]);
  }
  return pts.length >= 4 ? pts : null;
}

/** Flat legacy ring: each pair is [latitude, longitude] (see `/api/mapbox/check-zone`). */
function ringLngLatFromLatLngPairs(ring: unknown[][]): [number, number][] | null {
  const pts: [number, number][] = [];
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    pts.push([lng, lat]);
  }
  return pts.length >= 4 ? pts : null;
}

/**
 * Legacy `polygon_coordinates` JSONB:
 * - Flat array of [lat, lng] pairs (see `/api/mapbox/check-zone`), or
 * - GeoJSON-style polygon coordinates `[ring][point][lng,lat]`.
 */
export function legacyPolygonCoordinatesToGeometry(polygon_coordinates: unknown): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!polygon_coordinates || !Array.isArray(polygon_coordinates)) return null;
  const outer = polygon_coordinates as unknown[];
  if (outer.length === 0) return null;

  const first = outer[0];
  // Flat [lat,lng][] ring
  if (Array.isArray(first) && typeof first[0] === "number") {
    const ring = ringLngLatFromLatLngPairs(outer as unknown[][]);
    return ring ? { type: "Polygon", coordinates: [ring] } : null;
  }

  // Nested: one polygon with rings [[[lng,lat],...], ...] OR multiple polygons
  if (Array.isArray(first) && Array.isArray(first[0]) && typeof (first[0] as unknown[])[0] === "number") {
    const rings = outer as unknown[][];
    const normalized = rings
      .map((r) => (Array.isArray(r) ? ringLngLatGeoJson(r as unknown[]) : null))
      .filter((x): x is [number, number][] => x != null);
    if (normalized.length) {
      return { type: "Polygon", coordinates: normalized };
    }
  }

  const polygons: number[][][][] = [];
  for (const poly of outer) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    const rings = poly as unknown[][];
    const normalized = rings
      .map((r) => (Array.isArray(r) ? ringLngLatGeoJson(r as unknown[]) : null))
      .filter((x): x is [number, number][] => x != null);
    if (normalized.length) polygons.push(normalized);
  }
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
  return { type: "MultiPolygon", coordinates: polygons };
}

export function legacyZoneCoverageGeometry(row: LegacyZoneRow): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const zt = (row.zone_type || "").toLowerCase();
  if (zt === "radius") {
    const lng = num(row.center_longitude);
    const lat = num(row.center_latitude);
    const r = num(row.radius_km);
    if (lng != null && lat != null && r != null && r > 0) {
      return legacyRadiusCoveragePolygon(lng, lat, r);
    }
    return null;
  }
  if (zt === "polygon") {
    return legacyPolygonCoordinatesToGeometry(row.polygon_coordinates);
  }
  return null;
}

export function legacyZoneListBbox(row: LegacyZoneRow): [number, number, number, number] | null {
  const g = legacyZoneCoverageGeometry(row);
  if (!g) return null;
  if (g.type === "Polygon") {
    const ring = g.coordinates[0] as [number, number][];
    return bboxFromLngLatRing(ring);
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const poly of g.coordinates) {
    const ring = poly[0] as [number, number][];
    const b = bboxFromLngLatRing(ring);
    if (!b) continue;
    minLng = Math.min(minLng, b[0]);
    minLat = Math.min(minLat, b[1]);
    maxLng = Math.max(maxLng, b[2]);
    maxLat = Math.max(maxLat, b[3]);
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}
