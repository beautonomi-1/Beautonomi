import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * User IDs that belong to a tenant for admin list/search scoping:
 * - provider owners (providers.user_id)
 * - customers who appear on bookings in the tenant (sampled)
 * - users with preferred_home_tenant_id = tenant
 *
 * Caps list size to keep `.in("id", …)` filters within practical PostgREST limits.
 */
export async function collectTenantScopedUserIds(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { maxBookingSample?: number; maxTotal?: number }
): Promise<string[]> {
  const maxBookings = opts?.maxBookingSample ?? 6000;
  /** Keep `.in("id", …)` within practical PostgREST query size */
  const maxTotal = opts?.maxTotal ?? 400;

  const [providersRes, bookingsRes, preferredRes] = await Promise.all([
    supabase.from("providers").select("user_id").eq("tenant_id", tenantId).not("user_id", "is", null),
    supabase.from("bookings").select("customer_id").eq("tenant_id", tenantId).not("customer_id", "is", null).limit(maxBookings),
    supabase.from("users").select("id").eq("preferred_home_tenant_id", tenantId),
  ]);

  const ids = new Set<string>();
  for (const r of providersRes.data ?? []) {
    const id = (r as { user_id?: string }).user_id;
    if (id) ids.add(id);
  }
  for (const r of bookingsRes.data ?? []) {
    const id = (r as { customer_id?: string }).customer_id;
    if (id) ids.add(id);
  }
  for (const r of preferredRes.data ?? []) {
    const id = (r as { id?: string }).id;
    if (id) ids.add(id);
  }
  return [...ids].slice(0, maxTotal);
}

/** All provider primary keys for a tenant (paginated; for admin aggregates). */
export async function fetchAllProviderIdsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  pageSize = 1000
): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows.map((r: { id: string }) => r.id));
    if (rows.length < pageSize) break;
  }
  return out;
}
