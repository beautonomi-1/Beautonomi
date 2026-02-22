/**
 * Mapbox Integration Utilities
 * 
 * Provides functions for:
 * - Geocoding (address to coordinates)
 * - Reverse geocoding (coordinates to address)
 * - Distance calculation
 * - Route calculation
 * - Service zone management
 * - Polygon operations
 * 
 * Reference: https://docs.mapbox.com/api/
 */

export interface MapboxConfig {
  accessToken: string;
  baseUrl?: string;
}

export interface Coordinates {
  longitude: number;
  latitude: number;
}

export interface GeocodeResult {
  id: string;
  type: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
  properties?: Record<string, any>;
}

export interface RouteResult {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: {
    type: string;
    coordinates: [number, number][];
  };
  legs: Array<{
    distance: number;
    duration: number;
    steps: Array<{
      distance: number;
      duration: number;
      geometry: {
        coordinates: [number, number][];
      };
      maneuver: {
        type: string;
        instruction: string;
      };
    }>;
  }>;
}

export interface DistanceMatrixResult {
  distances: number[][]; // in meters
  durations: number[][]; // in seconds
}

export interface ServiceZone {
  id: string;
  name: string;
  type: "radius" | "polygon";
  coordinates: Coordinates | Coordinates[]; // single point for radius, array for polygon
  radius_km?: number; // for radius type
  is_active: boolean;
}

class MapboxService {
  private config: MapboxConfig;

  constructor(config: MapboxConfig) {
    this.config = {
      baseUrl: "https://api.mapbox.com",
      ...config,
    };
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(query: string, options?: {
    proximity?: Coordinates;
    country?: string;
    types?: string[];
    limit?: number;
  }): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      q: query,
    });

    if (options?.proximity) {
      params.append("proximity", `${options.proximity.longitude},${options.proximity.latitude}`);
    }
    if (options?.country) {
      params.append("country", options.country);
    }
    if (options?.types) {
      params.append("types", options.types.join(","));
    }
    if (options?.limit) {
      params.append("limit", options.limit.toString());
    }

    const response = await fetch(
      `${this.config.baseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`
    );

    if (!response.ok) {
      throw new Error(`Mapbox geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.features || [];
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(coordinates: Coordinates): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      access_token: this.config.accessToken,
    });

    const response = await fetch(
      `${this.config.baseUrl}/geocoding/v5/mapbox.places/${coordinates.longitude},${coordinates.latitude}.json?${params}`
    );

    if (!response.ok) {
      throw new Error(`Mapbox reverse geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.features?.[0] || null;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.latitude - point1.latitude);
    const dLon = this.toRadians(point2.longitude - point1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.latitude)) *
        Math.cos(this.toRadians(point2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  /**
   * Calculate route between two or more points
   */
  async calculateRoute(waypoints: Coordinates[], options?: {
    profile?: "driving" | "walking" | "cycling";
    alternatives?: boolean;
    geometries?: "geojson" | "polyline" | "polyline6";
    overview?: "full" | "simplified" | "false";
    steps?: boolean;
  }): Promise<RouteResult> {
    const profile = options?.profile || "driving";
    const coordinates = waypoints
      .map((wp) => `${wp.longitude},${wp.latitude}`)
      .join(";");

    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      geometries: options?.geometries || "geojson",
      overview: options?.overview || "full",
      steps: (options?.steps !== false).toString(),
      alternatives: (options?.alternatives || false).toString(),
    });

    const response = await fetch(
      `${this.config.baseUrl}/directions/v5/mapbox/${profile}/${coordinates}?${params}`
    );

    if (!response.ok) {
      throw new Error(`Mapbox routing failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error("No route found");
    }

    const route = data.routes[0];
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      legs: route.legs || [],
    };
  }

  /**
   * Calculate distance matrix for multiple points
   */
  async calculateDistanceMatrix(
    origins: Coordinates[],
    destinations: Coordinates[],
    options?: {
      profile?: "driving" | "walking" | "cycling";
    }
  ): Promise<DistanceMatrixResult> {
    const profile = options?.profile || "driving";
    const coordinates = [...origins, ...destinations]
      .map((coord) => `${coord.longitude},${coord.latitude}`)
      .join(";");

    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      sources: Array.from({ length: origins.length }, (_, i) => i.toString()).join(";"),
      destinations: Array.from(
        { length: destinations.length },
        (_, i) => (origins.length + i).toString()
      ).join(";"),
    });

    const response = await fetch(
      `${this.config.baseUrl}/directions-matrix/v1/mapbox/${profile}/${coordinates}?${params}`
    );

    if (!response.ok) {
      throw new Error(`Mapbox distance matrix failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      distances: data.distances || [],
      durations: data.durations || [],
    };
  }

  /**
   * Check if a point is within a service zone
   */
  isPointInZone(point: Coordinates, zone: ServiceZone): boolean {
    if (zone.type === "radius") {
      if (!zone.radius_km || !Array.isArray(zone.coordinates) || zone.coordinates.length === 0) {
        return false;
      }
      const center = zone.coordinates[0];
      const distance = this.calculateDistance(center, point);
      return distance <= zone.radius_km;
    } else if (zone.type === "polygon") {
      if (!Array.isArray(zone.coordinates) || zone.coordinates.length < 3) {
        return false;
      }
      return this.isPointInPolygon(point, zone.coordinates);
    }
    return false;
  }

  /**
   * Check if a point is inside a polygon (Ray casting algorithm)
   */
  private isPointInPolygon(point: Coordinates, polygon: Coordinates[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      const intersect =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Calculate polygon area (in square kilometers)
   */
  calculatePolygonArea(polygon: Coordinates[]): number {
    if (polygon.length < 3) return 0;

    let area = 0;
    const R = 6371; // Earth's radius in kilometers

    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const lat1 = this.toRadians(polygon[i].latitude);
      const lat2 = this.toRadians(polygon[j].latitude);
      const dLon = this.toRadians(polygon[j].longitude - polygon[i].longitude);

      area +=
        ((dLon / (2 * Math.PI)) *
          (2 * Math.PI * R * R * Math.sin(lat1) * Math.sin(lat2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon))) /
        2;
    }

    return Math.abs(area);
  }

  /**
   * Get bounding box for a set of coordinates
   */
  getBoundingBox(coordinates: Coordinates[]): {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } {
    if (coordinates.length === 0) {
      throw new Error("Cannot calculate bounding box for empty coordinates");
    }

    let minLng = coordinates[0].longitude;
    let maxLng = coordinates[0].longitude;
    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;

    for (const coord of coordinates) {
      minLng = Math.min(minLng, coord.longitude);
      maxLng = Math.max(maxLng, coord.longitude);
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
    }

    return { minLng, minLat, maxLng, maxLat };
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// Singleton instance
let mapboxInstance: MapboxService | null = null;

export async function getMapboxService(): Promise<MapboxService> {
  if (!mapboxInstance) {
    // Load secret access token from platform_secrets (fallback to env)
    const { getMapboxAccessToken } = await import("@/lib/platform/secrets");
    const accessToken = (await getMapboxAccessToken()) || "";

    if (!accessToken) {
      // Check if Mapbox is enabled in config
      try {
        const { getSupabaseServer } = await import("@/lib/supabase/server");
        const supabase = await getSupabaseServer();
        const { data: config } = await supabase
          .from("mapbox_config")
          .select("is_enabled")
          .single();
        
        // If Mapbox is explicitly disabled, return a service that will fail gracefully
        if (config && !config.is_enabled) {
          throw new Error("Mapbox is disabled in configuration");
        }
      } catch {
        // Config doesn't exist or error checking - continue with error
      }
      
      throw new Error("MAPBOX_ACCESS_TOKEN not configured. Please set it in the admin portal at /admin/mapbox or environment variables.");
    }
    mapboxInstance = new MapboxService({ accessToken });
  }
  return mapboxInstance;
}

export function createMapboxService(config: MapboxConfig): MapboxService {
  return new MapboxService(config);
}
