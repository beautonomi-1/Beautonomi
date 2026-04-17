import type mapboxgl from "mapbox-gl";

/** Bbox from list/detail API */
export type ZoneBbox =
  | [number, number, number, number]
  | { minLng: number; minLat: number; maxLng: number; maxLat: number }
  | null
  | undefined;

export function asGeomFeature(g: unknown): GeoJSON.Feature | null {
  if (!g || typeof g !== "object") return null;
  const o = g as { type?: string };
  if (o.type !== "Polygon" && o.type !== "MultiPolygon") return null;
  return {
    type: "Feature",
    properties: {},
    geometry: o as GeoJSON.Polygon | GeoJSON.MultiPolygon,
  };
}

/** Build a GeoJSON Polygon from a bbox [minLng, minLat, maxLng, maxLat] or object form */
export function bboxToPolygonFeature(bbox: ZoneBbox): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!bbox) return null;
  let minLng: number;
  let minLat: number;
  let maxLng: number;
  let maxLat: number;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
  } else if (typeof bbox === "object" && "minLng" in bbox) {
    ({ minLng, minLat, maxLng, maxLat } = bbox as {
      minLng: number;
      minLat: number;
      maxLng: number;
      maxLat: number;
    });
  } else {
    return null;
  }
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];
const DEFAULT_ZOOM = 6;

/** Bounds that wrap mapboxgl without importing default in every caller */
export function geometryToBounds(
  Mapbox: { LngLatBounds: typeof mapboxgl.LngLatBounds },
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): mapboxgl.LngLatBounds | null {
  const coords: number[][] = [];
  if (g.type === "Polygon") g.coordinates[0].forEach((c) => coords.push(c));
  else g.coordinates.forEach((p) => p[0].forEach((c) => coords.push(c)));
  if (coords.length === 0) return null;
  return coords.reduce(
    (b, c) => b.extend(c as [number, number]),
    new Mapbox.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
  );
}

export function fitMapToZoneDetail(
  map: mapboxgl.Map,
  Mapbox: typeof import("mapbox-gl").default,
  opts: {
    bbox?: ZoneBbox;
    coverageFeature: GeoJSON.Feature | null;
    geometryGeojson?: unknown;
    countryCode?: string | null;
  },
) {
  const { bbox, coverageFeature, geometryGeojson, countryCode } = opts;

  if (bbox) {
    const f = bboxToPolygonFeature(bbox);
    if (f?.geometry) {
      const b = geometryToBounds(Mapbox, f.geometry);
      if (b) {
        map.fitBounds(b, { padding: 48, maxZoom: 13 });
        return;
      }
    }
  }

  const cov = coverageFeature?.geometry;
  if (cov && (cov.type === "Polygon" || cov.type === "MultiPolygon")) {
    const b = geometryToBounds(Mapbox, cov);
    if (b) {
      map.fitBounds(b, { padding: 48, maxZoom: 13 });
      return;
    }
  }

  const raw = geometryGeojson as GeoJSON.Geometry | null | undefined;
  if (raw && (raw.type === "Polygon" || raw.type === "MultiPolygon")) {
    const b = geometryToBounds(Mapbox, raw);
    if (b) {
      map.fitBounds(b, { padding: 48, maxZoom: 13 });
      return;
    }
  }

  if (countryCode) {
    map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, essential: true });
  }
}

export function parseCentroidLngLat(centroid: unknown): [number, number] | null {
  if (!centroid) return null;
  if (Array.isArray(centroid) && centroid.length >= 2) {
    const a = centroid as [number, number];
    return [a[0], a[1]];
  }
  if (typeof centroid === "object" && centroid !== null && "coordinates" in centroid) {
    const c = (centroid as { coordinates?: [number, number] }).coordinates;
    if (Array.isArray(c) && c.length >= 2) return [c[0], c[1]];
  }
  return null;
}
