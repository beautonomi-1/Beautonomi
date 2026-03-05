/**
 * Hook for user's saved addresses + Mapbox address search.
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

export interface GeocodeSuggestion {
  place_name: string;
  center: [number, number];
  text: string;
  context?: { id: string; text: string }[];
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

export async function searchAddress(query: string): Promise<GeocodeSuggestion[]> {
  if (!query || query.length < 3) return [];
  try {
    const res = await fetch(`${APP_URL}/api/mapbox/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        country: "ZA",
        types: ["address", "place", "poi"],
        limit: 5,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const data = json.data ?? json;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
