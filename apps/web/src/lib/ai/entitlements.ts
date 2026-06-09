/**
 * Provider plan → AI entitlements. Subscription-gated AI features.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SUBSCRIPTION_ENTITLED_STATUSES,
  SUBSCRIPTION_PAST_DUE_GRACE_DAYS,
} from "@/lib/subscriptions/feature-access";

/**
 * Resolve the entitled subscription plan id for a provider.
 *
 * Uses the same status semantics as the rest of the stack
 * (`SUBSCRIPTION_ENTITLED_STATUSES`): active + trialing always count; past_due
 * counts only within the grace window. A lapse returns null so callers fall
 * back to the free tier.
 */
export async function determineProviderPlan(providerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const graceCutoff = new Date(
    Date.now() - SUBSCRIPTION_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("plan_id, status, updated_at")
    .eq("provider_id", providerId)
    .in("status", SUBSCRIPTION_ENTITLED_STATUSES as unknown as string[])
    .or(`expires_at.gte.${nowIso},expires_at.is.null`)
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as { plan_id?: string; status?: string; updated_at?: string } | null;
  if (!row?.plan_id) return null;
  // past_due only grants access within the grace window.
  if (row.status === "past_due" && row.updated_at && row.updated_at < graceCutoff) {
    return null;
  }
  return row.plan_id;
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
