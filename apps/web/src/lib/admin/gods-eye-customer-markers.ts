import type { SupabaseClient } from "@supabase/supabase-js";

export type GodsEyeCustomerMarker = {
  user_id: string;
  lat: number;
  lng: number;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  address_label: string | null;
  source: "saved_address" | "booking_address";
  last_seen_at: string | null;
};

function pickBestAddress<T extends { user_id: string; is_default?: boolean | null; updated_at?: string | null }>(
  rows: T[],
  getKey: (r: T) => string
): Map<string, T> {
  const byUser = new Map<string, T[]>();
  for (const r of rows) {
    const uid = getKey(r);
    const arr = byUser.get(uid) ?? [];
    arr.push(r);
    byUser.set(uid, arr);
  }
  const best = new Map<string, T>();
  for (const [uid, arr] of byUser) {
    arr.sort((a, b) => {
      const ad = a.is_default ? 1 : 0;
      const bd = b.is_default ? 1 : 0;
      if (bd !== ad) return bd - ad;
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bt - at;
    });
    best.set(uid, arr[0]!);
  }
  return best;
}

/**
 * Customer locations for Gods Eye (superadmin-only): saved addresses first, else last booking drop-off coords.
 */
export async function fetchGodsEyeCustomerMarkers(
  admin: SupabaseClient,
  tenantId: string,
  maxMarkers: number
): Promise<GodsEyeCustomerMarker[]> {
  const [{ data: preferredRows }, { data: bookingCustomerRows }] = await Promise.all([
    admin.from("users").select("id").eq("role", "customer").eq("preferred_home_tenant_id", tenantId),
    admin.from("bookings").select("customer_id").eq("tenant_id", tenantId).not("customer_id", "is", null).limit(12000),
  ]);

  const idSet = new Set<string>();
  for (const r of preferredRows ?? []) {
    const id = (r as { id: string }).id;
    if (id) idSet.add(id);
  }
  for (const r of bookingCustomerRows ?? []) {
    const id = (r as { customer_id: string }).customer_id;
    if (id) idSet.add(id);
  }

  /** Cap candidate pool so `.in()` filters stay within PostgREST practical limits */
  const customerIds = [...idSet].slice(0, 4000);
  if (customerIds.length === 0) return [];

  type AddrRow = {
    user_id: string;
    latitude: number | string | null;
    longitude: number | string | null;
    city?: string | null;
    country?: string | null;
    label?: string | null;
    is_default?: boolean | null;
    updated_at?: string | null;
  };

  const IN_CHUNK = 400;
  const addressRowsAcc: AddrRow[] = [];
  for (let i = 0; i < customerIds.length; i += IN_CHUNK) {
    const chunk = customerIds.slice(i, i + IN_CHUNK);
    const { data: addressRows, error: addrErr } = await admin
      .from("user_addresses")
      .select("user_id, latitude, longitude, city, country, label, is_default, updated_at")
      .in("user_id", chunk)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (addrErr) throw addrErr;
    addressRowsAcc.push(...((addressRows ?? []) as AddrRow[]));
  }

  const addrList = addressRowsAcc;
  const bestAddr = pickBestAddress(addrList, (r) => r.user_id);

  const missingForBooking = customerIds.filter((id) => !bestAddr.has(id)).slice(0, maxMarkers * 2);
  const bookingByCustomer = new Map<
    string,
    {
      address_latitude: number;
      address_longitude: number;
      updated_at: string | null;
      scheduled_at: string | null;
    }
  >();

  if (missingForBooking.length > 0) {
    type Br = {
      customer_id: string;
      address_latitude: unknown;
      address_longitude: unknown;
      updated_at?: string | null;
      scheduled_at?: string | null;
    };
    const bookRowsAcc: Br[] = [];
    for (let i = 0; i < missingForBooking.length; i += IN_CHUNK) {
      const chunk = missingForBooking.slice(i, i + IN_CHUNK);
      const { data: bookRows, error: bErr } = await admin
        .from("bookings")
        .select("customer_id, address_latitude, address_longitude, updated_at, scheduled_at")
        .eq("tenant_id", tenantId)
        .in("customer_id", chunk)
        .not("address_latitude", "is", null)
        .not("address_longitude", "is", null);

      if (bErr) throw bErr;
      bookRowsAcc.push(...((bookRows ?? []) as Br[]));
    }

    const sorted = [...bookRowsAcc].sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return tb - ta;
    });

    for (const row of sorted) {
      const cid = row.customer_id;
      if (!cid || bookingByCustomer.has(cid)) continue;
      const lat = Number(row.address_latitude);
      const lng = Number(row.address_longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      bookingByCustomer.set(cid, {
        address_latitude: lat,
        address_longitude: lng,
        updated_at: row.updated_at ?? null,
        scheduled_at: row.scheduled_at ?? null,
      });
    }
  }

  const markerUserIds = new Set<string>();
  for (const uid of bestAddr.keys()) markerUserIds.add(uid);
  for (const uid of bookingByCustomer.keys()) markerUserIds.add(uid);

  if (markerUserIds.size === 0) return [];

  const markerIdList = [...markerUserIds];
  const userRowsAcc: { id: string; full_name?: string | null; email?: string | null; phone?: string | null }[] = [];
  for (let i = 0; i < markerIdList.length; i += IN_CHUNK) {
    const chunk = markerIdList.slice(i, i + IN_CHUNK);
    const { data: userRows, error: uErr } = await admin
      .from("users")
      .select("id, full_name, email, phone")
      .in("id", chunk)
      .eq("role", "customer");

    if (uErr) throw uErr;
    userRowsAcc.push(...((userRows ?? []) as { id: string; full_name?: string | null; email?: string | null; phone?: string | null }[]));
  }

  const userById = new Map(userRowsAcc.map((u) => [u.id, u]));

  const out: GodsEyeCustomerMarker[] = [];

  for (const uid of markerUserIds) {
    const u = userById.get(uid);
    if (!u) continue;

    const addr = bestAddr.get(uid);
    const bk = bookingByCustomer.get(uid);

    if (addr) {
      const lat = Number(addr.latitude);
      const lng = Number(addr.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        user_id: uid,
        lat,
        lng,
        display_name: u.full_name?.trim() || u.email || "Customer",
        email: u.email ?? null,
        phone: u.phone ?? null,
        city: addr.city ?? null,
        country: addr.country ?? null,
        address_label: addr.label ?? null,
        source: "saved_address",
        last_seen_at: addr.updated_at ?? null,
      });
    } else if (bk) {
      out.push({
        user_id: uid,
        lat: bk.address_latitude,
        lng: bk.address_longitude,
        display_name: u.full_name?.trim() || u.email || "Customer",
        email: u.email ?? null,
        phone: u.phone ?? null,
        city: null,
        country: null,
        address_label: null,
        source: "booking_address",
        last_seen_at: bk.scheduled_at ?? bk.updated_at,
      });
    }
  }

  out.sort((a, b) => {
    const pa = a.source === "saved_address" ? 1 : 0;
    const pb = b.source === "saved_address" ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  });

  return out.slice(0, maxMarkers);
}
