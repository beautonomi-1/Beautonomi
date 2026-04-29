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
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";

/** Same origin resolution as `api` client — required when EXPO_PUBLIC_APP_URL is empty (native dev → localhost:3000). */
function mapboxApiOrigin(): string {
  return getBackendUrl().trim().replace(/\/$/, "");
}

function mapboxFetchInit(init?: RequestInit): RequestInit {
  const merged = withWebApiTenantHeaders(init);
  const h = new Headers(merged.headers as HeadersInit | undefined);
  if (!h.has("X-Active-Market-Country")) {
    h.set("X-Active-Market-Country", getDeviceRegionCountryIso());
  }
  return { ...merged, headers: h };
}

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
  address?: string;
  properties?: {
    address?: string;
    full_address?: string;
  };
  context?: { id: string; text: string }[];
}

function normalizeGeocodeFeature(f: any): GeocodeSuggestion {
  let center: [number, number] = [0, 0];
  if (Array.isArray(f?.center) && f.center.length >= 2) {
    center = [Number(f.center[0]), Number(f.center[1])];
  } else if (
    f?.geometry?.type === "Point" &&
    Array.isArray(f.geometry?.coordinates) &&
    f.geometry.coordinates.length >= 2
  ) {
    center = [Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])];
  }
  return {
    place_name: typeof f?.place_name === "string" ? f.place_name : "",
    center,
    text: typeof f?.text === "string" ? f.text : (f?.place_name ?? ""),
    address: typeof f?.address === "string" ? f.address : undefined,
    properties: f?.properties && typeof f.properties === "object" ? f.properties : undefined,
    context: Array.isArray(f?.context) ? f.context : undefined,
  };
}

export function useAddresses(enabled: boolean) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(() => !!enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (attempt = 0) => {
      if (!enabled) {
        setAddresses([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      if (attempt === 0) setError(null);

      try {
        const res = await api.get<SavedAddress[] | { data?: SavedAddress[] }>("/api/me/addresses");
        if (res.error) {
          const status = (res.error as { status?: number }).status;
          if (status === 401 || status === 403) {
            setAddresses([]);
            setError(null);
          } else {
            if (attempt < 1) {
              await new Promise((r) => setTimeout(r, 450));
              await load(attempt + 1);
              return;
            }
            setError(res.error.message ?? "Failed to load addresses");
          }
        } else {
          const raw = res.data;
          const list = Array.isArray(raw) ? raw : (raw as { data?: SavedAddress[] })?.data ?? [];
          setAddresses(Array.isArray(list) ? list : []);
          setError(null);
        }
      } catch {
        if (attempt < 1 && enabled) {
          await new Promise((r) => setTimeout(r, 450));
          await load(attempt + 1);
          return;
        }
        setError("Failed to load addresses");
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setAddresses([]);
      setLoading(false);
      setError(null);
      return;
    }
    void load();
  }, [enabled, load]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return { addresses, loading, error, reload: load, defaultAddress };
}

export interface SearchAddressOptions {
  /** Bias results near this point (longitude, latitude). */
  proximity?: { longitude: number; latitude: number };
  /** ISO 3166-1 alpha-2 (default from device locale). */
  country?: string;
  /**
   * Mapbox forward-geocode `types` filter. Omit for full fuzzy results (places, localities,
   * neighborhoods, addresses, POIs) — same as provider/web autocomplete. Pass e.g. `["address"]`
   * only when you need street-only matches.
   */
  types?: string[];
  /** Max suggestions (server allows 1–10; default 10). */
  limit?: number;
}

export async function searchAddress(
  query: string,
  options?: SearchAddressOptions
): Promise<GeocodeSuggestion[]> {
  if (!query || query.length < 2) return [];
  const origin = mapboxApiOrigin();
  if (!origin) return [];
  try {
    const body: Record<string, unknown> = {
      query: query.trim(),
      country: options?.country ?? getDeviceRegionCountryIso(),
      types: ["address"],
      limit: 5,
    };
    if (options?.proximity) {
      body.proximity = {
        longitude: options.proximity.longitude,
        latitude: options.proximity.latitude,
      };
    }
    const res = await fetch(
      `${origin}/api/mapbox/geocode`,
      mapboxFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      error?: { code?: string; message?: string };
    };
    if (!res.ok) {
      return [];
    }
    const payload = json?.data;
    const list = Array.isArray(payload) ? payload : [];
    return list
      .map(normalizeGeocodeFeature)
      .filter((s) => s.place_name && s.center[0] !== 0 && s.center[1] !== 0);
  } catch {
    return [];
  }
}

/** Reverse-geocode coordinates to a single address. Aligned with POST /api/mapbox/reverse-geocode. */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodeSuggestion | null> {
  const origin = mapboxApiOrigin();
  if (!origin) return null;
  try {
    const res = await fetch(
      `${origin}/api/mapbox/reverse-geocode`,
      mapboxFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ longitude, latitude }),
      }),
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const feature = json?.data ?? null;
    if (!feature?.place_name || !Array.isArray(feature?.center) || feature.center.length < 2) return null;
    return normalizeGeocodeFeature(feature);
  } catch {
    return null;
  }
}
