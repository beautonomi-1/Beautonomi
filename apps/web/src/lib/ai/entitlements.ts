/**
 * Provider plan → AI entitlements. Subscription-gated AI features.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SUBSCRIPTION_ENTITLED_STATUSES,
  SUBSCRIPTION_PAST_DUE_GRACE_DAYS,
} from "@/lib/subscriptions/feature-access";
import { isPastDueWithinGrace } from "@/lib/iap/apple/billing-active";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";

/**
 * Resolve the effective subscription plan id for AI entitlements.
 *
 * Uses the same status semantics as the rest of the stack
 * (`SUBSCRIPTION_ENTITLED_STATUSES`): active + trialing always count; past_due
 * counts only within the grace window. Lapsed or missing subscriptions fall
 * back to the free catalog plan (same as `getProviderSubscriptionTier`).
 */
export async function determineProviderPlan(providerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const graceCutoff = new Date(
    Date.now() - SUBSCRIPTION_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("plan_id, status, updated_at, billing_provider, apple_grace_period_expires_at")
    .eq("provider_id", providerId)
    .in("status", SUBSCRIPTION_ENTITLED_STATUSES as unknown as string[])
    .or(
      `expires_at.gte.${nowIso},expires_at.is.null,apple_grace_period_expires_at.gte.${nowIso}`,
    )
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as {
    plan_id?: string;
    status?: string;
    updated_at?: string;
    billing_provider?: string | null;
    apple_grace_period_expires_at?: string | null;
  } | null;

  if (row?.plan_id) {
    if (row.status === "past_due") {
      const entitled = isPastDueWithinGrace({
        billingProvider: row.billing_provider,
        updatedAt: row.updated_at,
        appleGracePeriodExpiresAt: row.apple_grace_period_expires_at,
        nowIso,
        graceCutoffIso: graceCutoff,
      });
      if (!entitled) {
        return resolveCatalogPlanIdForProviderSubscription(supabase);
      }
    }
    return row.plan_id;
  }

  return resolveCatalogPlanIdForProviderSubscription(supabase);
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

  if (entitlement.calls_per_day > 0) {
    const supabase = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("feature_key", featureKey)
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);
    if ((count ?? 0) >= entitlement.calls_per_day) {
      return { allowed: false, entitlement, reason: "plan_daily_limit_exceeded" };
    }
  }

  return { allowed: true, entitlement };
}
