/**
 * Hook for user's saved addresses + Mapbox address search.
 *
 * Mapbox API alignment (web):
 * - POST /api/mapbox/geocode: body { query, country?, types?, limit?, proximity? { longitude, latitude } }
 *   → response { data: MapboxFeature[] } (each: place_name, center [lng,lat], text, context?)
 * - POST /api/mapbox/reverse-geocode: body { longitude, latitude }
 *   → response { data: MapboxFeature | null } (single feature, same shape)
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { APP_URL } from "@/config/public-env";

export interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
}

/** Aligned with Mapbox Geocoding API feature shape (place_name, center [lng,lat], text, context). */
export interface GeocodeSuggestion {
  place_name: string;
  center: [number, number];
  text: string;
  context?: { id: string; text: string }[];
}

function normalizeGeocodeFeature(f: any): GeocodeSuggestion {
  const center = Array.isArray(f?.center) && f.center.length >= 2
    ? [Number(f.center[0]), Number(f.center[1])] as [number, number]
    : [0, 0] as [number, number];
  return {
    place_name: typeof f?.place_name === "string" ? f.place_name : "",
    center,
    text: typeof f?.text === "string" ? f.text : (f?.place_name ?? ""),
    context: Array.isArray(f?.context) ? f.context : undefined,
  };
}

export function useAddresses(enabled: boolean) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await api.get<SavedAddress[] | { data?: SavedAddress[] }>("/api/me/addresses");
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return { addresses, loading, reload: load, defaultAddress };
}

export interface SearchAddressOptions {
  /** Bias results near this point (longitude, latitude). */
  proximity?: { longitude: number; latitude: number };
  /** ISO 3166-1 alpha-2 (default "ZA"). */
  country?: string;
}

export async function searchAddress(
  query: string,
  options?: SearchAddressOptions
): Promise<GeocodeSuggestion[]> {
  if (!query || query.length < 3) return [];
  if (!APP_URL?.trim()) return [];
  try {
    const body: Record<string, unknown> = {
      query: query.trim(),
      country: options?.country ?? "ZA",
      types: ["address", "place", "poi"],
      limit: 5,
    };
    if (options?.proximity) {
      body.proximity = {
        longitude: options.proximity.longitude,
        latitude: options.proximity.latitude,
      };
    }
    const res = await fetch(`${APP_URL}/api/mapbox/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const data = json.data ?? json;
    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeGeocodeFeature).filter((s) => s.place_name && s.center[0] !== 0 && s.center[1] !== 0);
  } catch {
    return [];
  }
}

/** Reverse-geocode coordinates to a single address. Aligned with POST /api/mapbox/reverse-geocode. */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodeSuggestion | null> {
  if (!APP_URL?.trim()) return null;
  try {
    const res = await fetch(`${APP_URL}/api/mapbox/reverse-geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ longitude, latitude }),
    });
    const json = await res.json().catch(() => ({}));
    const feature = json?.data ?? null;
    if (!feature?.place_name || !Array.isArray(feature?.center) || feature.center.length < 2) return null;
    return normalizeGeocodeFeature(feature);
  } catch {
    return null;
  }
}
