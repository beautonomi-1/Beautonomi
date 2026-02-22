/**
 * Directions URL Generator
 * 
 * Generates navigation directions URLs based on platform configuration.
 * Supports Mapbox (when configured) and falls back to Google Maps.
 * 
 * Usage:
 * const url = await getDirectionsUrl({ latitude: -26.1234, longitude: 28.5678 }, "123 Main St, Johannesburg");
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DirectionsConfig {
  provider: "mapbox" | "google" | "auto";
  mapboxPublicToken?: string;
}

// Cache the config to avoid repeated API calls
let cachedConfig: DirectionsConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch directions configuration from the API
 */
async function fetchDirectionsConfig(): Promise<DirectionsConfig> {
  // Check cache first
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedConfig;
  }

  try {
    const response = await fetch("/api/public/directions-config");
    if (response.ok) {
      const data = await response.json();
      cachedConfig = data.data || { provider: "google" };
      cacheTimestamp = Date.now();
      return cachedConfig!;
    }
  } catch (error) {
    console.error("Failed to fetch directions config:", error);
  }

  // Default to Google Maps as fallback
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

  // If Mapbox is configured and preferred, use Mapbox navigation deeplink
  // Note: Mapbox deeplinks work on mobile devices with Mapbox installed
  // For web, we fall back to a directions page or Google Maps
  if (config.provider === "mapbox" && config.mapboxPublicToken) {
    // Mapbox Navigation deeplink format (works on mobile with Mapbox app)
    // For web users, we'll use Google Maps as Mapbox doesn't have a web directions viewer
    const isMobile = typeof navigator !== "undefined" && 
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Try Mapbox Navigation deeplink for mobile
      // Format: mapbox://navigation?destination=longitude,latitude
      return `mapbox://navigation?destination=${destination.longitude},${destination.latitude}`;
    }
    
    // For web, Mapbox doesn't have a standalone directions viewer
    // Fall through to Google Maps for web users
  }

  // Google Maps Directions URL (universal fallback)
  // Format: https://www.google.com/maps/dir/?api=1&destination=lat,lng
  const baseUrl = "https://www.google.com/maps/dir/";
  const params = new URLSearchParams({
    api: "1",
    destination: address || `${destination.latitude},${destination.longitude}`,
  });

  if (origin) {
    params.append("origin", `${origin.latitude},${origin.longitude}`);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate a simple map link (not directions, just shows location)
 * Useful for showing a location on a map without routing
 */
export async function getMapUrl(
  location: Coordinates,
  address?: string
): Promise<string> {
  const config = await fetchDirectionsConfig();
  
  if (config.provider === "mapbox" && config.mapboxPublicToken) {
    // Mapbox static map or marker URL
    // For now, use Google Maps as Mapbox requires embedding
    // A custom map page could be built for Mapbox
  }

  // Google Maps location URL
  const query = address 
    ? encodeURIComponent(address)
    : `${location.latitude},${location.longitude}`;
  
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Synchronous version for simple use cases (uses default Google Maps)
 * Use getDirectionsUrl for proper async configuration loading
 */
export function getDirectionsUrlSync(
  destination: Coordinates,
  address?: string
): string {
  const destQuery = address 
    ? encodeURIComponent(`${address}`)
    : `${destination.latitude},${destination.longitude}`;
  
  return `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;
}
