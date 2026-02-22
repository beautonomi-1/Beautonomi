/**
 * Geocode a provider location that has address text but missing latitude/longitude.
 * Used for locations created by ensure_freelancer_location or any address-only create.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMapboxService } from "./mapbox";

export interface GeocodeProviderLocationResult {
  ok: boolean;
  latitude?: number;
  longitude?: number;
  error?: string;
}

/**
 * Build a full address string from provider_locations fields.
 */
export function buildFullAddress(row: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
    row.country,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Geocode a single provider location by id: if it has address but null coords,
 * call Mapbox and update the row. Returns { ok, latitude, longitude } or { ok: false, error }.
 */
export async function geocodeProviderLocation(
  supabase: SupabaseClient,
  locationId: string
): Promise<GeocodeProviderLocationResult> {
  const { data: row, error: fetchError } = await supabase
    .from("provider_locations")
    .select("id, address_line1, address_line2, city, state, postal_code, country, latitude, longitude")
    .eq("id", locationId)
    .single();

  if (fetchError || !row) {
    return { ok: false, error: fetchError?.message ?? "Location not found" };
  }

  const r = row as {
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };

  if (r.latitude != null && r.longitude != null) {
    return { ok: true, latitude: r.latitude, longitude: r.longitude };
  }

  if (!r.address_line1 || !r.city || !r.country) {
    return { ok: false, error: "Address line1, city, and country required for geocoding" };
  }

  try {
    const mapbox = await getMapboxService();
    const fullAddress = buildFullAddress(r);
    const results = await mapbox.geocode(fullAddress, {
      country: r.country ?? undefined,
      limit: 1,
    });

    if (results.length === 0) {
      return { ok: false, error: "No geocode result" };
    }

    const result = results[0];
    const latitude = result.center[1];
    const longitude = result.center[0];

    const { error: updateError } = await supabase
      .from("provider_locations")
      .update({ latitude, longitude })
      .eq("id", locationId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    return { ok: true, latitude, longitude };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Geocoding failed" };
  }
}
