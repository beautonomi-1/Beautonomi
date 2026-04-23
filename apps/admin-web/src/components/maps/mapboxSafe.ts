import type { Map as MapboxMap } from "mapbox-gl";

/**
 * Mapbox GL v3 can briefly leave `map.style` undefined during style load/swap/teardown;
 * calling `getLayer` / `getSource` then throws (e.g. getOwnLayer on undefined).
 */
export function mapboxStyleAvailable(map: MapboxMap | null | undefined): boolean {
  if (!map) return false;
  try {
    return map.getStyle?.() != null;
  } catch {
    return false;
  }
}

export function safeRemoveLayer(map: MapboxMap, layerId: string): void {
  try {
    if (!mapboxStyleAvailable(map)) return;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  } catch {
    /* style gone or map destroyed */
  }
}

export function safeRemoveSource(map: MapboxMap, sourceId: string): void {
  try {
    if (!mapboxStyleAvailable(map)) return;
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    /* style gone or map destroyed */
  }
}
