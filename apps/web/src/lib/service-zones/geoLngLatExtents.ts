/**
 * Map fit helpers for GeoJSON Polygon / MultiPolygon (all rings, all shells).
 */

export type LngLatCorners = [[number, number], [number, number]];

function collectLngLats(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): { lngs: number[]; lats: number[] } {
  const lngs: number[] = [];
  const lats: number[] = [];

  const pushRing = (ring: number[][]) => {
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      lngs.push(lng);
      lats.push(lat);
    }
  };

  if (g.type === "Polygon") {
    for (const ring of g.coordinates) {
      pushRing(ring);
    }
  } else {
    for (const poly of g.coordinates) {
      for (const ring of poly) {
        pushRing(ring);
      }
    }
  }

  return { lngs, lats };
}

/** Southwest and northeast corners for `map.fitBounds`, or null if empty. */
export function fitBoundsCornersFromPolygonLike(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): LngLatCorners | null {
  const { lngs, lats } = collectLngLats(g);
  if (!lngs.length) return null;
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
