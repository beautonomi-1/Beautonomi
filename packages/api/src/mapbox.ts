/**
 * Mapbox helper - calls apps/web /api/mapbox routes.
 * No auth required for geocode/reverse-geocode.
 */
import { apiFetch } from "./client";

export interface GeocodeOptions {
  query: string;
  proximity?: { longitude: number; latitude: number };
  country?: string;
  types?: string[];
  limit?: number;
}

export interface ReverseGeocodeOptions {
  longitude: number;
  latitude: number;
}

export async function geocode(
  baseUrl: string,
  options: GeocodeOptions
) {
  const { data, error } = await apiFetch<unknown[]>(
    "/api/mapbox/geocode",
    {
      method: "POST",
      body: {
        query: options.query,
        proximity: options.proximity,
        country: options.country,
        types: options.types,
        limit: options.limit ?? 5,
      },
      baseUrl,
    }
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function reverseGeocode(
  baseUrl: string,
  options: ReverseGeocodeOptions
) {
  const { data, error } = await apiFetch<unknown>(
    "/api/mapbox/reverse-geocode",
    {
      method: "POST",
      body: { longitude: options.longitude, latitude: options.latitude },
      baseUrl,
    }
  );
  if (error) throw new Error(error.message);
  return data;
}
