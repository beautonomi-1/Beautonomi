/**
 * Shared LLM access for agent workflows via callLlm().
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callLlm } from "@/lib/ai/call-llm";
import { estimateCostUsd, sanitizeCostUsd } from "@/lib/ai/pricing";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { enforceAiBudget, logAiUsage } from "@/lib/ai/enforce-budget";
import { preferCachingCapableCatalog } from "@/lib/ai/merge-catalog";
import { routeModel, type ModelCatalogEntry, type ModelTask } from "@beautonomi/agent-model-router";
import {
  applyRoutingPolicy,
  parseRoutingPolicy,
  resolveTaskModelOverride,
  resolveTaskTierOverride,
} from "./routing-policy";
import { localePromptSuffix, resolveReplyLocale, resolveUserPreferredLanguage } from "./locale";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";
const LARGE_SYSTEM_PROMPT_CHARS = 1500;

export type AgentLlmResult =
  | { configured: false }
  | { configured: true; success: false; errorCode?: string }
  | {
      configured: true;
      success: true;
      text: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      schemaValid?: boolean | null;
    };

export interface CallAgentLlmParams {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  schema?: Record<string, unknown>;
  runId?: string;
  stepSeq?: number;
  promptVersion?: string;
  featureKey?: string;
  task?: ModelTask;
  riskTier?: number;
  tenantId?: string | null;
  modelId?: string;
  fallbackModelId?: string | null;
  /** agent_definitions.id — required for ai_usage_log when no auth user principal. */
  agentId?: string;
  maxCostUsd?: number;
  spentUsd?: number;
  images?: Array<{ url?: string; base64?: string; mime?: string }>;
  visionEnabled?: boolean;
  /** users.id — loads preferred_language when locale is omitted. */
  recipientUserId?: string;
  locale?: string;
}

type AgentBrain = {
  preferred_model_id: string | null;
  fallback_model_id: string | null;
  task_default: ModelTask | null;
  max_cost_usd_per_run: number | null;
  vision_enabled: boolean;
  reply_locale_mode: string;
};

async function loadAgentBrain(agentId: string): Promise<AgentBrain | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_definitions")
    .select(
      "preferred_model_id, fallback_model_id, task_default, max_cost_usd_per_run, vision_enabled, reply_locale_mode",
    )
    .eq("id", agentId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    preferred_model_id: (row.preferred_model_id as string | null) ?? null,
    fallback_model_id: (row.fallback_model_id as string | null) ?? null,
    task_default: (row.task_default as ModelTask | null) ?? null,
    max_cost_usd_per_run:
      row.max_cost_usd_per_run != null ? Number(row.max_cost_usd_per_run) : null,
    vision_enabled: Boolean(row.vision_enabled),
    reply_locale_mode: String(row.reply_locale_mode ?? "recipient"),
  };
}

async function loadModuleRoutingPolicy(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_module_config")
    .select("default_routing_policy_id")
    .eq("environment", ENVIRONMENT)
    .maybeSingle();
  return (data as { default_routing_policy_id?: string | null } | null)?.default_routing_policy_id ?? null;
}

function findCatalogEntry(catalog: ModelCatalogEntry[], modelId: string): ModelCatalogEntry | null {
  return catalog.find((c) => c.id === modelId && c.enabled) ?? null;
}

function resolveAgentModelId(params: {
  catalog: ModelCatalogEntry[];
  task: ModelTask;
  riskTier: number;
  maxCostUsd: number;
  spentUsd: number;
  explicitModelId?: string;
  preferredModelId?: string | null;
  routingPolicyRaw: string | null;
  largeSystemPrompt: boolean;
}): string {
  const policy = parseRoutingPolicy(params.routingPolicyRaw);
  let catalog = applyRoutingPolicy(params.catalog, policy);
  if (params.largeSystemPrompt) {
    catalog = preferCachingCapableCatalog(catalog);
  }

  const taskOverride = resolveTaskModelOverride(policy, params.task, catalog);
  if (params.explicitModelId && findCatalogEntry(catalog, params.explicitModelId)) {
    return params.explicitModelId;
  }
  if (params.preferredModelId && findCatalogEntry(catalog, params.preferredModelId)) {
    return params.preferredModelId;
  }
  if (taskOverride) return taskOverride;

  const routed = routeModel({
    task: params.task,
    riskTier: params.riskTier,
    contextTokens: 500,
    escalationSignals: [],
    escalationCount: 0,
    maxEscalations: 2,
    maxCostUsd: params.maxCostUsd,
    spentUsd: params.spentUsd,
    catalog,
    tierOverride: resolveTaskTierOverride(policy, params.task),
  });
  return routed.modelId;
}

async function nextStepSeq(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  runId: string,
): Promise<number> {
  const { data } = await supabase
    .from("agent_steps")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number((data as { seq?: number } | null)?.seq ?? 0) + 1;
}

export async function recordAgentModelStep(params: {
  runId: string;
  seq?: number;
  model: string;
  modelProvider?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  promptVersion?: string;
  schemaValid?: boolean | null;
  error?: string | null;
  gateway?: boolean;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const seq = params.seq ?? (await nextStepSeq(supabase, params.runId));
    await supabase.from("agent_steps").insert({
      run_id: params.runId,
      seq,
      kind: "model",
      model_provider: params.modelProvider ?? null,
      model_id: params.model,
      prompt_version: params.promptVersion ?? null,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      cost_usd: sanitizeCostUsd(params.costUsd),
      latency_ms: params.latencyMs,
      schema_valid: params.schemaValid ?? null,
      error: params.error ?? null,
    });

    const { data: run } = await supabase
      .from("agent_runs")
      .select("total_tokens_in, total_tokens_out, total_cost_usd")
      .eq("id", params.runId)
      .maybeSingle();
    const current = (run ?? {}) as {
      total_tokens_in?: number;
      total_tokens_out?: number;
      total_cost_usd?: number | string;
    };
    await supabase
      .from("agent_runs")
      .update({
        total_tokens_in: Number(current.total_tokens_in ?? 0) + params.tokensIn,
        total_tokens_out: Number(current.total_tokens_out ?? 0) + params.tokensOut,
        total_cost_usd: sanitizeCostUsd(Number(current.total_cost_usd ?? 0) + params.costUsd),
      })
      .eq("id", params.runId);
  } catch (err) {
    console.warn("[agents/llm] failed to record model step", err);
  }
}

export async function callAgentLlm(params: CallAgentLlmParams): Promise<AgentLlmResult> {
  const runtime = await resolveAiRuntime(ENVIRONMENT, params.tenantId ?? null);
  if (!runtime.config.enabled) return { configured: false };

  if (runtime.emergency.stopAllCalls || runtime.emergency.forceTemplateFallback) {
    return { configured: true, success: false, errorCode: "LLM_BLOCKED_BY_KILL_SWITCH" };
  }

  const budget = await enforceAiBudget({
    feature_key: params.featureKey ?? "agent",
    actor_user_id: null,
    agent_id: params.agentId ?? null,
    provider_id: null,
    role: "agent",
    environment: ENVIRONMENT,
    tenant_id: params.tenantId ?? null,
    agent_workforce: true,
  });
  if (!budget.allowed) {
    return { configured: true, success: false, errorCode: budget.reason ?? "budget_blocked" };
  }

  const brain = params.agentId ? await loadAgentBrain(params.agentId) : null;
  const routingPolicyRaw = await loadModuleRoutingPolicy();
  const task: ModelTask = params.task ?? brain?.task_default ?? "classification";
  const maxCostUsd = params.maxCostUsd ?? brain?.max_cost_usd_per_run ?? 0.25;
  const catalog = runtime.catalog.length ? runtime.catalog : [];
  const modelId = resolveAgentModelId({
    catalog,
    task,
    riskTier: params.riskTier ?? 1,
    maxCostUsd,
    spentUsd: params.spentUsd ?? 0,
    explicitModelId: params.modelId,
    preferredModelId: brain?.preferred_model_id,
    routingPolicyRaw,
    largeSystemPrompt: params.system.length >= LARGE_SYSTEM_PROMPT_CHARS,
  });
  const fallbackModelId = params.fallbackModelId ?? brain?.fallback_model_id ?? null;
  const visionEnabled = params.visionEnabled ?? brain?.vision_enabled ?? false;

  const recipientLocale =
    params.locale ?? (params.recipientUserId ? await resolveUserPreferredLanguage(params.recipientUserId) : "en");
  const replyLocale = resolveReplyLocale({
    replyLocaleMode: brain?.reply_locale_mode,
    recipientLocale,
  });
  const systemWithLocale =
    replyLocale !== "en" ? `${params.system}${localePromptSuffix(replyLocale)}` : params.system;

  const startedAt = Date.now();
  const result = await callLlm({
    system: systemWithLocale,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 800,
    schema: params.schema,
    images: visionEnabled ? params.images : undefined,
    timeoutMs: 60_000,
    featureKey: params.featureKey ?? "agent",
    task,
    riskTier: params.riskTier ?? 1,
    tenantId: params.tenantId ?? null,
    environment: ENVIRONMENT,
    modelId,
    fallbackModelId,
    maxCostUsd,
    spentUsd: params.spentUsd ?? 0,
  });
  const latencyMs = Date.now() - startedAt;
  const model = result.model || runtime.config.defaultModelId;
  const costUsd = sanitizeCostUsd(await estimateCostUsd(model, result.tokensIn, result.tokensOut));

  if (params.agentId) {
    await logAiUsage({
      actor_user_id: null,
      agent_id: params.agentId,
      provider_id: null,
      feature_key: params.featureKey ?? "agent",
      model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_estimate: costUsd,
      success: result.success,
      error_code: result.errorCode ?? null,
      tenant_id: params.tenantId ?? null,
      model_provider: result.modelProvider,
      runtime: result.runtime,
      gateway: result.gateway,
      latency_ms: latencyMs,
      fallback_used: Boolean(result.failoverModel),
      breaker_tripped: result.breakerTripped ?? false,
    });
  }

  const failed = !result.success || !result.text.trim();
  const schemaValid =
    params.schema != null
      ? failed
        ? false
        : result.schemaValid === false
          ? false
          : isJsonParseable(result.text)
      : null;

  if (params.runId) {
    await recordAgentModelStep({
      runId: params.runId,
      seq: params.stepSeq,
      model,
      modelProvider: result.modelProvider,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd,
      latencyMs,
      promptVersion: params.promptVersion,
      schemaValid,
      error: failed ? (result.errorCode ?? "EMPTY_RESPONSE") : null,
      gateway: result.gateway,
    });
  }

  if (failed) {
    return { configured: true, success: false, errorCode: result.errorCode };
  }
  return {
    configured: true,
    success: true,
    text: result.text,
    model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd,
    schemaValid,
  };
}

function isJsonParseable(text: string): boolean {
  return parseLlmJson(text) !== null;
}

export function parseLlmJson<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
