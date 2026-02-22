/**
 * Provider plan → AI entitlements. Subscription-gated AI features.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resolve active subscription plan id for a provider.
 */
export async function determineProviderPlan(providerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("plan_id")
    .eq("provider_id", providerId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { plan_id?: string } | null)?.plan_id ?? null;
}

export interface AiEntitlement {
  feature_key: string;
  enabled: boolean;
  calls_per_day: number;
  max_tokens: number;
  model_tier: string;
}

/**
 * Get AI entitlements for a plan. Returns default off when no row.
 */
export async function getPlanEntitlements(planId: string, featureKey: string): Promise<AiEntitlement | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ai_plan_entitlements")
    .select("feature_key, enabled, calls_per_day, max_tokens, model_tier")
    .eq("plan_id", planId)
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (!data) return null;
  return {
    feature_key: (data as { feature_key: string }).feature_key,
    enabled: Boolean((data as { enabled: boolean }).enabled),
    calls_per_day: Number((data as { calls_per_day: number }).calls_per_day),
    max_tokens: Number((data as { max_tokens: number }).max_tokens),
    model_tier: String((data as { model_tier: string }).model_tier),
  };
}

/**
 * Check if provider is allowed to use this AI feature (plan entitlement + limit).
 */
export async function checkProviderAiEntitlement(
  providerId: string,
  featureKey: string
): Promise<{ allowed: boolean; entitlement?: AiEntitlement; reason?: string }> {
  const planId = await determineProviderPlan(providerId);
  if (!planId) {
    return { allowed: false, reason: "no_active_plan" };
  }

  const entitlement = await getPlanEntitlements(planId, featureKey);
  if (!entitlement) {
    return { allowed: false, reason: "feature_not_entitled" };
  }
  if (!entitlement.enabled) {
    return { allowed: false, entitlement, reason: "feature_disabled_for_plan" };
  }

  return { allowed: true, entitlement };
}
