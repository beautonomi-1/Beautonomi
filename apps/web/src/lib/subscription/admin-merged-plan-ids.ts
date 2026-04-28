import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchOptionalTenantListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * Subscription plan IDs visible for a tenant merge (global defaults + tenant overrides).
 * Matches admin `/api/admin/plans` and provider subscription catalog scoping.
 */
export async function getMergedSubscriptionPlanIdsForTenant(
  tenantId: string | null | undefined,
): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const effectiveTenant = typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : "";
  const { data } = await fetchOptionalTenantListMerged<Record<string, unknown>>({
    supabase: admin,
    table: "subscription_plans",
    tenantId: effectiveTenant,
    select: "*",
    dedupeKey: (row) => String(row.name ?? row.id ?? ""),
    orderBy: { column: "display_order", ascending: true },
  });
  return new Set((data || []).map((r) => String(r.id ?? "")).filter(Boolean));
}
