import type { SupabaseClient } from "@supabase/supabase-js";

export type PricingPlanRow = {
  id: string;
  name?: string | null;
  subscription_plan_id?: string | null;
  display_order?: number | null;
  updated_at?: string | null;
  tenant_id?: string | null;
  is_active?: boolean | null;
  [key: string]: unknown;
};

const LEGACY_UNLINKED_NAMES = new Set(["Starter", "Professional", "Enterprise"]);

function subscriptionPlanId(row: PricingPlanRow): string | null {
  const id = row.subscription_plan_id;
  if (typeof id !== "string" || !id.trim()) return null;
  return id.trim();
}

function displayOrder(row: PricingPlanRow): number {
  const n = row.display_order;
  return typeof n === "number" && Number.isFinite(n) ? n : 9999;
}

function updatedAtMs(row: PricingPlanRow): number {
  const u = row.updated_at;
  if (typeof u !== "string" || !u) return 0;
  const t = Date.parse(u);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Load active subscription plan ids for catalog filtering.
 */
export async function loadActiveSubscriptionPlanIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("is_active", true);

  if (error) {
    console.warn("[published-pricing-plans] subscription_plans:", error.message);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { id?: string }).id;
    if (id) out.add(id);
  }
  return out;
}

/**
 * Keep only pricing cards linked to an active subscription plan.
 * Drops legacy CMS rows (null subscription_plan_id) and orphaned links.
 */
export function filterPricingPlansByActiveSubscriptions<T extends PricingPlanRow>(
  plans: T[],
  activeSubscriptionIds: Set<string>,
): T[] {
  return plans.filter((row) => {
    const subId = subscriptionPlanId(row);
    if (!subId) return false;
    return activeSubscriptionIds.has(subId);
  });
}

/**
 * At most one pricing card per subscription_plan_id.
 * Input should already be tenant-merged (tenant rows override global for same key).
 * Tie-break: lower display_order, then newer updated_at.
 */
export function dedupePricingPlansBySubscriptionId<T extends PricingPlanRow>(plans: T[]): T[] {
  const bySub = new Map<string, T>();

  for (const row of plans) {
    const subId = subscriptionPlanId(row);
    if (!subId) continue;

    const existing = bySub.get(subId);
    if (!existing) {
      bySub.set(subId, row);
      continue;
    }

    const rowOrder = displayOrder(row);
    const exOrder = displayOrder(existing);
    if (rowOrder < exOrder) {
      bySub.set(subId, row);
      continue;
    }
    if (rowOrder > exOrder) continue;

    if (updatedAtMs(row) >= updatedAtMs(existing)) {
      bySub.set(subId, row);
    }
  }

  return [...bySub.values()].sort((a, b) => displayOrder(a) - displayOrder(b));
}

export async function resolvePublishedPricingPlanRows<T extends PricingPlanRow>(
  supabase: SupabaseClient,
  mergedPlans: T[],
): Promise<T[]> {
  const activeIds = await loadActiveSubscriptionPlanIds(supabase);
  const linked = filterPricingPlansByActiveSubscriptions(mergedPlans, activeIds);
  return dedupePricingPlansBySubscriptionId(linked);
}

/**
 * Whether a single pricing row is allowed in onboarding / public catalog.
 */
export function isPublishedPricingPlanRow(
  row: PricingPlanRow | null | undefined,
  activeSubscriptionIds: Set<string>,
): boolean {
  if (!row || row.is_active === false) return false;
  const subId = subscriptionPlanId(row);
  if (!subId) return false;
  return activeSubscriptionIds.has(subId);
}

/** Legacy 066 plan names — used in staging verification only. */
export function isLegacyUnlinkedPricingPlanName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return LEGACY_UNLINKED_NAMES.has(name.trim());
}
