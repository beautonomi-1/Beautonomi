/**
 * AI budget enforcement: module config, daily credits, per-provider and per-user limits.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slackNotifyAiBudgetThreshold } from "@/lib/ai/alerts";

export interface EnforceAiBudgetParams {
  feature_key: string;
  actor_user_id: string;
  provider_id: string | null;
  role: string;
  environment: string;
  tenant_id?: string | null;
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
async function loadAiModuleConfig(environment: string, tenantId?: string | null) {
  const supabase = getSupabaseAdmin();
  const select =
    "enabled, daily_budget_credits, per_provider_calls_per_day, per_user_calls_per_day, cache_ttl_seconds, monthly_budget_usd, alert_threshold_pct, tenant_id";

  if (tenantId) {
    const { data: tenantRow } = await supabase
      .from("ai_module_config")
      .select(select)
      .eq("environment", environment)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (tenantRow) return { data: tenantRow, error: null };
  }

  return supabase
    .from("ai_module_config")
    .select(select)
    .eq("environment", environment)
    .is("tenant_id", null)
    .maybeSingle();
}

function spendQuery(supabase: ReturnType<typeof getSupabaseAdmin>, tenantId?: string | null) {
  let q = supabase.from("ai_usage_log").select("cost_estimate");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  return q;
}

function usageCountQuery(supabase: ReturnType<typeof getSupabaseAdmin>, tenantId?: string | null) {
  let q = supabase.from("ai_usage_log").select("id", { count: "exact", head: true });
  if (tenantId) q = q.eq("tenant_id", tenantId);
  return q;
}

export async function enforceAiBudget(params: EnforceAiBudgetParams): Promise<EnforceAiBudgetResult> {
  const { feature_key: _feature_key, actor_user_id, provider_id, environment, tenant_id: tenantId } = params;
  const supabase = getSupabaseAdmin();

  const { data: aiConfig, error: configError } = await loadAiModuleConfig(environment, tenantId);

  if (configError || !aiConfig) {
    return { allowed: false, disabled: true, reason: "ai_module_not_configured", fallback_mode: "off" };
  }

  if (!aiConfig.enabled) {
    return { allowed: false, disabled: true, reason: "ai_module_disabled", fallback_mode: "off" };
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: agentConfig } = await supabase
    .from("agent_module_config")
    .select("global_daily_spend_cap_usd")
    .eq("environment", environment)
    .maybeSingle();

  const spendCapUsd = Number(agentConfig?.global_daily_spend_cap_usd ?? 0);
  if (spendCapUsd > 0) {
    const { data: spendRows } = await spendQuery(supabase, tenantId)
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);
    const spentUsd = (spendRows ?? []).reduce(
      (sum, row) => sum + Number((row as { cost_estimate?: number }).cost_estimate ?? 0),
      0,
    );
    if (spentUsd >= spendCapUsd) {
      return { allowed: false, reason: "global_spend_cap_exceeded", fallback_mode: "templates_only" };
    }
  }

  const monthStart = `${today.slice(0, 7)}-01`;
  const monthlyCap = Number((aiConfig as { monthly_budget_usd?: number }).monthly_budget_usd ?? 0);
  const alertPct = Number((aiConfig as { alert_threshold_pct?: number }).alert_threshold_pct ?? 80);
  if (monthlyCap > 0) {
    const { data: monthRows } = await spendQuery(supabase, tenantId).gte("created_at", `${monthStart}T00:00:00Z`);
    const monthSpent = (monthRows ?? []).reduce(
      (sum, row) => sum + Number((row as { cost_estimate?: number }).cost_estimate ?? 0),
      0,
    );
    if (monthSpent >= monthlyCap) {
      return { allowed: false, reason: "monthly_budget_exceeded", fallback_mode: "templates_only" };
    }
    if (monthSpent >= monthlyCap * (alertPct / 100)) {
      slackNotifyAiBudgetThreshold({
        environment,
        scope: "monthly",
        spentUsd: monthSpent,
        capUsd: monthlyCap,
        thresholdPct: alertPct,
      });
    }
  }

  if (Number(aiConfig.daily_budget_credits) > 0) {
    const { count } = await usageCountQuery(supabase, tenantId)
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
  tenant_id?: string | null;
  model_provider?: string | null;
  runtime?: string | null;
  gateway?: boolean;
  latency_ms?: number;
  fallback_used?: boolean;
  breaker_tripped?: boolean;
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
    tenant_id: params.tenant_id ?? null,
    model_provider: params.model_provider ?? null,
    runtime: params.runtime ?? null,
    gateway: params.gateway ?? false,
    latency_ms: params.latency_ms ?? null,
    fallback_used: params.fallback_used ?? false,
    breaker_tripped: params.breaker_tripped ?? false,
  });
}
