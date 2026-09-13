/**
 * Shared LLM access for agent workflows via callLlm().
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callLlm } from "@/lib/ai/call-llm";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { GEMINI_MODELS, type ModelTask } from "@beautonomi/agent-model-router";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

export const DEFAULT_AGENT_MODEL = GEMINI_MODELS.flashLite;

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
      model_provider: params.modelProvider ?? "gemini",
      model_id: params.model,
      prompt_version: params.promptVersion ?? null,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      cost_usd: params.costUsd,
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
        total_cost_usd: Math.round((Number(current.total_cost_usd ?? 0) + params.costUsd) * 1_000_000) / 1_000_000,
      })
      .eq("id", params.runId);
  } catch (err) {
    console.warn("[agents/llm] failed to record model step", err);
  }
}

export async function callAgentLlm(params: CallAgentLlmParams): Promise<AgentLlmResult> {
  const runtime = await resolveAiRuntime(ENVIRONMENT, params.tenantId ?? null);
  if (!runtime.config.enabled) return { configured: false };

  const startedAt = Date.now();
  const result = await callLlm({
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 800,
    schema: params.schema,
    timeoutMs: 60_000,
    featureKey: params.featureKey ?? "agent",
    task: params.task ?? "complex_reasoning",
    riskTier: params.riskTier ?? 1,
    tenantId: params.tenantId ?? null,
    environment: ENVIRONMENT,
    modelId: params.modelId,
  });
  const latencyMs = Date.now() - startedAt;
  const model = result.model || runtime.config.defaultModelId || DEFAULT_AGENT_MODEL;
  const costUsd = await estimateCostUsd(model, result.tokensIn, result.tokensOut);

  const failed = !result.success || !result.text.trim();
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
      schemaValid: params.schema ? (failed ? false : isJsonParseable(result.text)) : null,
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
