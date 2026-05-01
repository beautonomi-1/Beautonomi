import type { SupabaseClient } from "@supabase/supabase-js";

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
