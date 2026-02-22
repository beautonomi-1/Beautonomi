/**
 * AI budget enforcement: module config, daily credits, per-provider and per-user limits.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface EnforceAiBudgetParams {
  feature_key: string;
  actor_user_id: string;
  provider_id: string | null;
  role: string;
  environment: string;
}

export interface EnforceAiBudgetResult {
  allowed: boolean;
  disabled?: boolean;
  reason?: string;
  fallback_mode?: "templates_only" | "off";
}

/**
 * Check AI module enabled, daily budget, per-provider and per-user limits.
 * Logs usage on success; does not log when blocked.
 */
export async function enforceAiBudget(params: EnforceAiBudgetParams): Promise<EnforceAiBudgetResult> {
  const { feature_key: _feature_key, actor_user_id, provider_id, environment } = params;
  const supabase = getSupabaseAdmin();

  const { data: aiConfig, error: configError } = await supabase
    .from("ai_module_config")
    .select("enabled, daily_budget_credits, per_provider_calls_per_day, per_user_calls_per_day")
    .eq("environment", environment)
    .maybeSingle();

  if (configError || !aiConfig) {
    return { allowed: false, disabled: true, reason: "ai_module_not_configured", fallback_mode: "off" };
  }

  if (!aiConfig.enabled) {
    return { allowed: false, disabled: true, reason: "ai_module_disabled", fallback_mode: "off" };
  }

  const today = new Date().toISOString().slice(0, 10);

  if (Number(aiConfig.daily_budget_credits) > 0) {
    const { count } = await supabase
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);
    const used = count ?? 0;
    if (used >= Number(aiConfig.daily_budget_credits)) {
      return { allowed: false, reason: "daily_budget_exceeded", fallback_mode: "templates_only" };
    }
  }

  if (provider_id && Number(aiConfig.per_provider_calls_per_day) > 0) {
    const { count } = await supabase
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", provider_id)
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);
    const used = count ?? 0;
    if (used >= Number(aiConfig.per_provider_calls_per_day)) {
      return { allowed: false, reason: "per_provider_limit_exceeded", fallback_mode: "templates_only" };
    }
  }

  if (Number(aiConfig.per_user_calls_per_day) > 0) {
    const { count } = await supabase
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("actor_user_id", actor_user_id)
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);
    const used = count ?? 0;
    if (used >= Number(aiConfig.per_user_calls_per_day)) {
      return { allowed: false, reason: "per_user_limit_exceeded", fallback_mode: "templates_only" };
    }
  }

  return { allowed: true };
}

/**
 * Log AI usage for billing and limits.
 */
export async function logAiUsage(params: {
  actor_user_id: string;
  provider_id: string | null;
  feature_key: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_estimate: number;
  success: boolean;
  error_code?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  await supabase.from("ai_usage_log").insert({
    actor_user_id: params.actor_user_id,
    provider_id: params.provider_id,
    feature_key: params.feature_key,
    model: params.model,
    tokens_in: params.tokens_in,
    tokens_out: params.tokens_out,
    cost_estimate: params.cost_estimate,
    success: params.success,
    error_code: params.error_code ?? null,
  });
}
