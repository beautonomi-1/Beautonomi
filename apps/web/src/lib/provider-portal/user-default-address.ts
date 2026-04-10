import type { SupabaseClient } from "@supabase/supabase-js";
import { getMapboxService } from "@/lib/mapbox/mapbox";

/** Customer saved this default home via app/web; providers cannot overwrite it. */
export class CustomerHomeAddressLockedError extends Error {
  readonly code = "CUSTOMER_ADDRESS_LOCKED" as const;
  constructor() {
    super(
      "This customer's home address was saved from their own account. Only the customer can change it.",
    );
    this.name = "CustomerHomeAddressLockedError";
  }
}

/** Default saved address row (house-call / distance). */
export type CustomerDefaultAddress = {
  id: string;
  user_id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  /** Set via /api/me/* when the customer owns this home address. */
  customer_managed_home: boolean;
  /** Convenience for provider UIs. */
  provider_may_edit: boolean;
};

export async function fetchDefaultAddressesForUsers(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, CustomerDefaultAddress>> {
  const map = new Map<string, CustomerDefaultAddress>();
  if (userIds.length === 0) return map;

  const { data, error } = await admin
    .from("user_addresses")
    .select(
      "id, user_id, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, customer_managed_home",
    )
    .in("user_id", userIds)
    .eq("is_default", true);

  if (error) {
    console.error("fetchDefaultAddressesForUsers:", error);
    return map;
  }

  for (const row of data || []) {
    const uid = row.user_id as string;
    if (map.has(uid)) continue;
    const managed = Boolean(
      (row as { customer_managed_home?: boolean }).customer_managed_home,
    );
    map.set(uid, {
      id: row.id as string,
      user_id: uid,
      address_line1: row.address_line1 as string,
      address_line2: (row.address_line2 as string | null) ?? null,
      city: row.city as string,
      state: (row.state as string | null) ?? null,
      postal_code: (row.postal_code as string | null) ?? null,
      country: row.country as string,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      customer_managed_home: managed,
      provider_may_edit: !managed,
    });
  }
  return map;
}

export type UpsertAddressInput = {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
};

function coordsMissingOrZero(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return true;
  if (Number(lat) === 0 && Number(lng) === 0) return true;
  return false;
}

/**
 * Upsert the customer's default `user_addresses` row (used for at-home distance).
 * Geocodes server-side when coordinates are missing so travel pricing still works.
 */
export async function upsertCustomerDefaultAddress(
  admin: SupabaseClient,
  userId: string,
  input: UpsertAddressInput,
): Promise<void> {
  const line1 = input.line1?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  if (!line1 || !city) {
    throw new Error("Address line 1 and city are required");
  }

  let lat = input.latitude != null ? Number(input.latitude) : null;
  let lng = input.longitude != null ? Number(input.longitude) : null;

  if (coordsMissingOrZero(lat, lng)) {
    try {
      const mapbox = await getMapboxService();
      const q = [line1, city, input.state, input.postal_code, input.country]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join(", ");
      const iso =
        input.country && /^[A-Za-z]{2}$/.test(input.country.trim())
          ? input.country.trim().toUpperCase()
          : undefined;
      const results = await mapbox.geocode(q, { country: iso, limit: 1 });
      const first = results[0];
      if (first?.center) {
        lng = first.center[0];
        lat = first.center[1];
      }
    } catch (e) {
      console.warn("upsertCustomerDefaultAddress: geocode fallback failed", e);
    }
  }

  if (coordsMissingOrZero(lat, lng)) {
    lat = null;
    lng = null;
  }

  const { data: existing } = await admin
    .from("user_addresses")
    .select("id, customer_managed_home")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  const existingRow = existing as { id: string; customer_managed_home?: boolean } | null;
  if (existingRow?.id && existingRow.customer_managed_home === true) {
    throw new CustomerHomeAddressLockedError();
  }

  const row = {
    user_id: userId,
    address_line1: line1,
    address_line2: input.line2?.trim() || null,
    city,
    state: input.state?.trim() || null,
    postal_code: input.postal_code?.trim() || null,
    country: (input.country || "ZA").trim(),
    latitude: lat,
    longitude: lng,
    is_default: true,
    customer_managed_home: false,
  };

  if (existingRow?.id) {
    const { error } = await admin.from("user_addresses").update(row).eq("id", existingRow.id);
    if (error) throw error;
    return;
  }

  await admin
    .from("user_addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  const { error: insertError } = await admin.from("user_addresses").insert(row);
  if (insertError) throw insertError;
}

/** Parse top-level `address` from provider client API JSON bodies. */
export function parseAddressFromBody(body: unknown): UpsertAddressInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as Record<string, unknown>).address;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const line1 =
    (typeof o.line1 === "string" && o.line1) ||
    (typeof o.address_line1 === "string" && o.address_line1) ||
    "";
  const city = typeof o.city === "string" ? o.city : "";
  if (!line1.trim() || !city.trim()) return null;
  const latRaw = o.latitude;
  const lngRaw = o.longitude;
  return {
    line1: line1.trim(),
    line2: typeof o.line2 === "string" ? o.line2 : typeof o.address_line2 === "string" ? o.address_line2 : null,
    city: city.trim(),
    state: typeof o.state === "string" ? o.state : null,
    postal_code: typeof o.postal_code === "string" ? o.postal_code : null,
    country: typeof o.country === "string" && o.country.trim() ? o.country.trim() : "ZA",
    latitude: typeof latRaw === "number" ? latRaw : latRaw != null ? Number(latRaw) : null,
    longitude: typeof lngRaw === "number" ? lngRaw : lngRaw != null ? Number(lngRaw) : null,
  };
}
