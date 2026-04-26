import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * Subscription plan IDs visible for a tenant merge (global defaults + tenant overrides).
 * Matches admin `/api/admin/plans` and provider subscription catalog scoping.
 */
export async function getMergedSubscriptionPlanIdsForTenant(
  tenantId: string | null | undefined,
): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const effectiveTenant = typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : "";
  const { data } = await fetchScopedListMerged<{ id?: string; name?: string }>({
    supabase: admin,
    table: "subscription_plans",
    tenantId: effectiveTenant,
    select: "id",
    dedupeKey: (row) => String(row.name ?? row.id ?? ""),
    orderBy: { column: "display_order", ascending: true },
  });
  return new Set((data || []).map((r) => String(r.id ?? "")).filter(Boolean));
}
