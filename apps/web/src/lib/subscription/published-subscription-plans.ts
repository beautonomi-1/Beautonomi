import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Paid plans that appear in the provider catalog and public plan list:
 * active `pricing_plans` linked to `subscription_plans`, scoped the same way
 * as marketing bullets (`tenant_id` match, else global null tenant).
 */
export async function getPublishedPaidSubscriptionPlanIds(
  supabase: SupabaseClient,
  tenantId: string | null
): Promise<Set<string>> {
  const { data: rows, error } = await supabase
    .from("pricing_plans")
    .select("subscription_plan_id, tenant_id")
    .eq("is_active", true)
    .not("subscription_plan_id", "is", null);

  if (error) {
    console.warn("[published-subscription-plans] pricing_plans:", error.message);
    return new Set();
  }

  const bySub = new Map<string, { tenant_id: string | null }[]>();
  for (const raw of rows ?? []) {
    const sid = (raw as { subscription_plan_id?: string | null }).subscription_plan_id;
    if (!sid) continue;
    const tid = ((raw as { tenant_id?: string | null }).tenant_id ?? null) as string | null;
    const list = bySub.get(sid) ?? [];
    list.push({ tenant_id: tid });
    bySub.set(sid, list);
  }

  const out = new Set<string>();
  for (const [sid, list] of bySub) {
    const tenantMatch = tenantId ? list.find((x) => x.tenant_id === tenantId) : undefined;
    const global = list.find((x) => x.tenant_id === null);
    const picked = tenantMatch ?? global ?? list[0];
    if (picked) out.add(sid);
  }
  return out;
}

export function filterPlansForPublishedCatalog<T extends { id: string; is_free?: boolean | null }>(
  plans: T[] | null | undefined,
  publishedPaidIds: Set<string>
): T[] {
  return (plans ?? []).filter((p) => Boolean(p.is_free) || publishedPaidIds.has(p.id));
}
