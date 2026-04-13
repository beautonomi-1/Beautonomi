import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlankHtmlContent } from "@/lib/html/pricing-feature-html-shared";

/**
 * Marketing/feature bullets shown on /pricing — stored in `pricing_plan_features`,
 * keyed by `pricing_plans.id`. `pricing_plans.subscription_plan_id` links to `subscription_plans.id`.
 */
export async function getDisplayFeatureBulletsForSubscriptionPlans(
  supabase: SupabaseClient,
  tenantId: string | null,
  subscriptionPlanIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const unique = [...new Set(subscriptionPlanIds.filter(Boolean))];
  if (unique.length === 0) return result;

  const { data: pricingRows, error } = await supabase
    .from("pricing_plans")
    .select("id, subscription_plan_id, tenant_id")
    .in("subscription_plan_id", unique)
    .eq("is_active", true);

  if (error) {
    console.warn("getDisplayFeatureBulletsForSubscriptionPlans: pricing_plans", error.message);
    return result;
  }

  const picked = pickPricingPlanIdPerSubscription(
    (pricingRows ?? []) as { id: string; subscription_plan_id: string; tenant_id: string | null }[],
    tenantId
  );

  const pricingPlanIds = [...picked.values()];
  if (pricingPlanIds.length === 0) return result;

  const { data: feats, error: featErr } = await supabase
    .from("pricing_plan_features")
    .select("plan_id, feature_text, display_order")
    .in("plan_id", pricingPlanIds)
    .order("display_order", { ascending: true });

  if (featErr) {
    console.warn("getDisplayFeatureBulletsForSubscriptionPlans: pricing_plan_features", featErr.message);
    return result;
  }

  const byPricingId = new Map<string, string[]>();
  for (const f of feats ?? []) {
    const pid = f.plan_id as string;
    const text = String(f.feature_text ?? "").trim();
    if (!text || isBlankHtmlContent(text)) continue;
    const arr = byPricingId.get(pid) ?? [];
    arr.push(text);
    byPricingId.set(pid, arr);
  }

  for (const [subId, pricingId] of picked) {
    result.set(subId, byPricingId.get(pricingId) ?? []);
  }

  return result;
}

function pickPricingPlanIdPerSubscription(
  rows: { id: string; subscription_plan_id: string; tenant_id: string | null }[],
  tenantId: string | null
): Map<string, string> {
  const bySub = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySub.get(r.subscription_plan_id) ?? [];
    list.push(r);
    bySub.set(r.subscription_plan_id, list);
  }
  const out = new Map<string, string>();
  for (const [subId, list] of bySub) {
    const tenantMatch = tenantId ? list.find((x) => x.tenant_id === tenantId) : undefined;
    const global = list.find((x) => x.tenant_id === null);
    const picked = tenantMatch ?? global ?? list[0];
    if (picked) out.set(subId, picked.id);
  }
  return out;
}
