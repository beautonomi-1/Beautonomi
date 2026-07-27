/**
 * Terminal checkout eligibility — which commercial models a provider can select
 * for a given product and subscription entitlements.
 *
 * Shop options (Option C):
 * - once_off_purchase: buy and own the device outright.
 * - subscription_bundle: terminal included in platform subscription (terminal_bundle plan feature).
 *   Allocated via allocate-from-subscription; no Paystack, no separate terminal fee.
 * - rental is NOT offered in checkout; non-ownership economics live in plan pricing only.
 *   Legacy rental orders remain in history/accounting.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import type { TerminalCommercialModel } from "@/lib/terminal/record-terminal-order-payment";

export type TerminalProductForEligibility = {
  id: string;
  vendor: string;
  product_code?: string | null;
  sku?: string | null;
  upfront_price?: number | null;
  monthly_price?: number | null;
  rental_price?: number | null;
  subscription_plan_eligible?: boolean | null;
  currency?: string | null;
};

export type TerminalBundleEntitlement = {
  enabled: boolean;
  includedTerminalCount: number | null;
  terminalModel: string | null;
  planName: string | null;
  planId: string | null;
  subscriptionId: string | null;
  usedCount: number;
  remainingCount: number | null;
};

export type TerminalCheckoutOption = {
  commercial_model: TerminalCommercialModel;
  label: string;
  price: number | null;
  currency: string;
  requires_payment: boolean;
  description?: string;
};

export type TerminalCheckoutEligibility = {
  options: TerminalCheckoutOption[];
  bundle: TerminalBundleEntitlement;
  subscription_bundle_flag_enabled: boolean;
};

type SubscriptionTier = {
  planId?: string;
  planName?: string;
  features: Record<string, unknown>;
  isFree: boolean;
};

/**
 * Providers without a provider_subscriptions row are on the free plan, so their plan
 * entitlements come from the active is_free plan. Mirrors getProviderSubscriptionTier
 * in @/lib/subscriptions/feature-access.
 */
async function getFreePlanTier(supabase: SupabaseClient): Promise<SubscriptionTier | null> {
  const { data: freePlan } = await supabase
    .from("subscription_plans")
    .select("id, name, features, is_free")
    .eq("is_free", true)
    .eq("is_active", true)
    .order("display_order")
    .limit(1)
    .maybeSingle();

  if (!freePlan) return null;
  return {
    planId: freePlan.id,
    planName: freePlan.name,
    features: (freePlan.features as Record<string, unknown>) ?? {},
    isFree: true,
  };
}

async function getProviderSubscriptionContext(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ tier: SubscriptionTier | null; subscriptionId: string | null }> {
  const nowIso = new Date().toISOString();
  const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: subscription } = await supabase
    .from("provider_subscriptions")
    .select(
      `id, plan_id, status, updated_at, plan:subscription_plans(id, name, features, is_free)`,
    )
    .eq("provider_id", providerId)
    .in("status", ["active", "trialing", "past_due"])
    .or(`expires_at.gte.${nowIso},expires_at.is.null`)
    .order("status", { ascending: true })
    .maybeSingle();

  if (!subscription?.plan) {
    return { subscriptionId: null, tier: await getFreePlanTier(supabase) };
  }

  if (subscription.status === "past_due") {
    const updatedAt = (subscription as { updated_at?: string }).updated_at;
    if (updatedAt && updatedAt < graceCutoff) {
      return { subscriptionId: null, tier: await getFreePlanTier(supabase) };
    }
  }

  const plan = subscription.plan as { id?: string; name?: string; features?: Record<string, unknown>; is_free?: boolean };
  return {
    subscriptionId: String((subscription as { id: string }).id),
    tier: {
      planId: plan.id,
      planName: plan.name,
      features: plan.features ?? {},
      isFree: plan.is_free === true,
    },
  };
}

function productMatchesBundleModel(
  product: TerminalProductForEligibility,
  terminalModel: string | null,
): boolean {
  if (!terminalModel?.trim()) return true;
  const needle = terminalModel.trim().toLowerCase();
  const candidates = [product.product_code, product.sku, product.vendor, product.id]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return candidates.some((c) => c === needle || c.includes(needle) || needle.includes(c));
}

async function countSubscriptionIncludedOrders(
  supabase: SupabaseClient,
  providerId: string,
  subscriptionId: string | null,
): Promise<number> {
  let query = supabase
    .from("terminal_orders")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("commercial_model", "subscription_bundle")
    .eq("invoice_status", "paid")
    .not("order_status", "in", '("cancelled","refunded","failed")');

  if (subscriptionId) {
    query = query.eq("subscription_id", subscriptionId);
  }

  const { count } = await query;
  return count ?? 0;
}

export async function getTerminalBundleEntitlement(
  supabase: SupabaseClient,
  providerId: string,
  product: TerminalProductForEligibility,
  tenantId: string | null,
): Promise<TerminalBundleEntitlement> {
  const bundleFlag = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.TERMINAL_SUBSCRIPTION_BUNDLE,
    tenantId,
  );
  const { tier, subscriptionId } = await getProviderSubscriptionContext(supabase, providerId);
  const bundle = (tier?.features?.terminal_bundle ?? {}) as Record<string, unknown>;
  const enabled =
    bundleFlag &&
    product.subscription_plan_eligible === true &&
    bundle.enabled === true &&
    tier != null;

  const includedTerminalCount =
    bundle.included_terminal_count == null
      ? null
      : Number(bundle.included_terminal_count);

  const usedCount = enabled
    ? await countSubscriptionIncludedOrders(supabase, providerId, subscriptionId)
    : 0;

  const remainingCount =
    includedTerminalCount == null ? null : Math.max(0, includedTerminalCount - usedCount);

  const terminalModel =
    typeof bundle.terminal_model === "string" && bundle.terminal_model.trim()
      ? bundle.terminal_model.trim()
      : null;

  const modelMatches = enabled ? productMatchesBundleModel(product, terminalModel) : false;

  return {
    enabled: enabled && modelMatches && (remainingCount == null || remainingCount > 0),
    includedTerminalCount,
    terminalModel,
    planName: tier?.planName ?? null,
    planId: tier?.planId ?? null,
    subscriptionId,
    usedCount,
    remainingCount,
  };
}

export async function getTerminalCheckoutEligibility(
  supabase: SupabaseClient,
  providerId: string,
  product: TerminalProductForEligibility,
  tenantId: string | null,
): Promise<TerminalCheckoutEligibility> {
  const currency = product.currency ?? "ZAR";
  const bundle = await getTerminalBundleEntitlement(supabase, providerId, product, tenantId);
  const subscriptionBundleFlag = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.TERMINAL_SUBSCRIPTION_BUNDLE,
    tenantId,
  );

  const options: TerminalCheckoutOption[] = [];

  if (product.upfront_price != null && Number(product.upfront_price) >= 0) {
    options.push({
      commercial_model: "once_off_purchase",
      label: "Once-off purchase",
      price: Number(product.upfront_price),
      currency,
      requires_payment: true,
      description: "Own the device outright after payment.",
    });
  }

  if (bundle.enabled) {
    options.push({
      commercial_model: "subscription_bundle",
      label: "Included with your plan",
      price: 0,
      currency,
      requires_payment: false,
      description: bundle.planName
        ? `Included in ${bundle.planName}${bundle.remainingCount != null ? ` (${bundle.remainingCount} remaining)` : ""}.`
        : "Included in your subscription plan.",
    });
  }

  return {
    options,
    bundle,
    subscription_bundle_flag_enabled: subscriptionBundleFlag,
  };
}

export function assertCommercialModelEligible(
  commercialModel: TerminalCommercialModel,
  eligibility: TerminalCheckoutEligibility,
): void {
  const allowed = new Set(eligibility.options.map((o) => o.commercial_model));
  if (!allowed.has(commercialModel)) {
    throw new Error(`Commercial model "${commercialModel}" is not available for this product.`);
  }
}
