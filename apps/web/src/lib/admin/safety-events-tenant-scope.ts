import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * Provider owners + active staff user_ids for a tenant (safety panic/check-in may be raised by either).
 */
export async function fetchTenantProviderSafetyUserIds(
  supabase: AdminClient,
  tenantId: string,
  tenantProviderIds: string[],
): Promise<string[]> {
  const userIdSet = new Set<string>();
  const { data: owners } = await supabase.from("providers").select("user_id").eq("tenant_id", tenantId);
  for (const o of owners ?? []) {
    const id = (o as { user_id?: string | null }).user_id;
    if (id) userIdSet.add(id);
  }
  if (tenantProviderIds.length > 0) {
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("user_id")
      .in("provider_id", tenantProviderIds)
      .eq("is_active", true);
    for (const s of staff ?? []) {
      const id = (s as { user_id?: string | null }).user_id;
      if (id) userIdSet.add(id);
    }
  }
  return [...userIdSet];
}

/** Open safety incidents: `created` or `dispatched` (not resolved/failed), scoped to tenant via booking or provider user. */
export async function countOpenSafetyEventsForTenant(
  supabase: AdminClient,
  tenantId: string,
  tenantProviderIds: string[],
): Promise<number> {
  try {
    const userIds = await fetchTenantProviderSafetyUserIds(supabase, tenantId, tenantProviderIds);
    const [viaBooking, viaUser] = await Promise.all([
      supabase
        .from("safety_events")
        .select("id, bookings!inner(tenant_id)", { count: "exact", head: true })
        .in("status", ["created", "dispatched"])
        .eq("bookings.tenant_id", tenantId),
      userIds.length > 0
        ? supabase
            .from("safety_events")
            .select("id", { count: "exact", head: true })
            .in("status", ["created", "dispatched"])
            .is("booking_id", null)
            .in("user_id", userIds)
        : Promise.resolve({ count: 0, error: null as null }),
    ]);
    const a = viaBooking.error ? 0 : (viaBooking.count ?? 0);
    const b =
      userIds.length === 0 || (viaUser as { error?: unknown }).error
        ? 0
        : ((viaUser as { count?: number | null }).count ?? 0);
    return a + b;
  } catch {
    return 0;
  }
}

export type OpenSafetyEventRow = {
  id: string;
  event_type: string;
  status: string;
  created_at: string;
  user_id: string;
  booking_id: string | null;
};

export async function fetchOpenSafetyEventsForTenant(
  supabase: AdminClient,
  tenantId: string,
  tenantProviderIds: string[],
  limit: number,
): Promise<OpenSafetyEventRow[]> {
  const userIds = await fetchTenantProviderSafetyUserIds(supabase, tenantId, tenantProviderIds);
  const [viaBooking, viaUser] = await Promise.all([
    supabase
      .from("safety_events")
      .select("id, event_type, status, created_at, user_id, booking_id, bookings!inner(tenant_id)")
      .in("status", ["created", "dispatched"])
      .eq("bookings.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    userIds.length > 0
      ? supabase
          .from("safety_events")
          .select("id, event_type, status, created_at, user_id, booking_id")
          .in("status", ["created", "dispatched"])
          .is("booking_id", null)
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as OpenSafetyEventRow[], error: null }),
  ]);

  const merged: OpenSafetyEventRow[] = [];
  const seen = new Set<string>();
  for (const row of (viaBooking.data ?? []) as OpenSafetyEventRow[]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  for (const row of (viaUser.data ?? []) as OpenSafetyEventRow[]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged.slice(0, limit);
}

const MAX_IDS_IN_OR_FILTER = 3500;

/** Recent booking ids for a tenant (panic may reference an in-tenant booking). */
export async function fetchRecentBookingIdsForTenantSafetyList(
  supabase: AdminClient,
  tenantId: string,
  max: number,
): Promise<string[]> {
  const cap = Math.min(max, MAX_IDS_IN_OR_FILTER);
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
}

/**
 * PostgREST `.or()` fragment: `user_id.in.(…),booking_id.in.(…)`.
 * Returns null when there is no tenant-relevant scope (caller should return an empty list).
 */
export function buildSafetyLogsTenantOrFilter(userIds: string[], bookingIds: string[]): string | null {
  const u = userIds.slice(0, MAX_IDS_IN_OR_FILTER);
  const b = bookingIds.slice(0, MAX_IDS_IN_OR_FILTER);
  const parts: string[] = [];
  if (u.length) parts.push(`user_id.in.(${u.join(",")})`);
  if (b.length) parts.push(`booking_id.in.(${b.join(",")})`);
  return parts.length ? parts.join(",") : null;
}

/** All tenants — superadmin `scope=global` picker. */
export async function countAllOpenSafetyEvents(supabase: AdminClient): Promise<number> {
  const { count, error } = await supabase
    .from("safety_events")
    .select("id", { count: "exact", head: true })
    .in("status", ["created", "dispatched"]);
  if (error) return 0;
  return count ?? 0;
}

export async function fetchOpenSafetyEventsGlobal(
  supabase: AdminClient,
  limit: number,
): Promise<OpenSafetyEventRow[]> {
  const { data, error } = await supabase
    .from("safety_events")
    .select("id, event_type, status, created_at, user_id, booking_id")
    .in("status", ["created", "dispatched"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as OpenSafetyEventRow[];
}
