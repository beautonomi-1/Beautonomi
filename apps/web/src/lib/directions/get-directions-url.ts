/**
 * Directions URL Generator
 *
 * Generates navigation/directions URLs. Prefers Mapbox (platform default);
 * falls back to Google Maps when Mapbox is not configured.
 *
 * Usage:
 * const url = await getDirectionsUrl({ latitude: -26.1234, longitude: 28.5678 }, "123 Main St, Johannesburg");
 */

import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DirectionsConfig {
  provider: "mapbox" | "google" | "auto";
  mapboxPublicToken?: string;
}

/** Mapbox directions URL (no token needed in URL). Use for links when platform uses Mapbox. */
export function getMapboxDirectionsUrl(
  destination: Coordinates,
  origin?: Coordinates
): string {
  const dest = `${destination.longitude},${destination.latitude}`;
  const base = "https://www.mapbox.com/directions/";
  const params = new URLSearchParams({ destination: dest });
  if (origin) params.set("origin", `${origin.longitude},${origin.latitude}`);
  return `${base}?${params.toString()}`;
}

/** Mapbox “view location” URL (single point, no routing). */
export function getMapboxMapUrl(location: Coordinates): string {
  return `https://www.mapbox.com/directions/?destination=${location.longitude},${location.latitude}`;
}

// Cache the config to avoid repeated API calls
let cachedConfig: DirectionsConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch directions configuration from the API
 */
async function fetchDirectionsConfig(): Promise<DirectionsConfig> {
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedConfig;
  }

  try {
    const cfg = await fetchMapboxPublicMapConfig();
    cachedConfig = {
      provider: cfg.provider === "mapbox" ? "mapbox" : "google",
      mapboxPublicToken: cfg.accessToken ?? undefined,
    };
    cacheTimestamp = Date.now();
    return cachedConfig;
  } catch (error) {
    console.error("Failed to fetch directions config:", error);
  }

  return { provider: "google" };
}

/**
 * Generate a directions URL for the given destination
 * 
 * @param destination - The destination coordinates (latitude, longitude)
 * @param address - The destination address (used for display purposes)
 * @param origin - Optional origin coordinates (user's current location)
 * @returns The directions URL to open
 */
export async function getDirectionsUrl(
  destination: Coordinates,
  address?: string,
  origin?: Coordinates
): Promise<string> {
  const config = await fetchDirectionsConfig();
  
  // Build the destination query
  const _destQuery = address 
    ? encodeURIComponent(address)
    : `${destination.latitude},${destination.longitude}`;

  if (config.provider === "mapbox") {
    // Mapbox: web directions page (no token in URL)
    return getMapboxDirectionsUrl(destination, origin);
  }

  // Google Maps fallback when Mapbox not configured
  const baseUrl = "https://www.google.com/maps/dir/";
  const params = new URLSearchParams({
    api: "1",
    destination: address || `${destination.latitude},${destination.longitude}`,
  });
  if (origin) params.append("origin", `${origin.latitude},${origin.longitude}`);
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate a simple map link (not directions, just shows location)
 * Useful for showing a location on a map without routing
 */
export async function getMapUrl(
  location: Coordinates,
  _address?: string
): Promise<string> {
  const config = await fetchDirectionsConfig();
  if (config.provider === "mapbox") {
    return getMapboxMapUrl(location);
  }
  const query = _address
    ? encodeURIComponent(_address)
    : `${location.latitude},${location.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Synchronous directions URL. Returns Mapbox URL (platform default).
 * Use getDirectionsUrl for async config-based provider selection.
 */
export function getDirectionsUrlSync(
  destination: Coordinates,
  _address?: string
): string {
  return getMapboxDirectionsUrl(destination);
}
