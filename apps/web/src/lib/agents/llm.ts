/**
 * Shared LLM access for agent workflows. Uses the platform Gemini integration
 * (gemini_integration_config) when enabled; callers must always handle the
 * `configured: false` / failure path with a deterministic fallback so agents
 * degrade gracefully instead of breaking.
 *
 * When a caller passes `runId`, every model call is recorded as an
 * `agent_steps` row (kind = 'model') and its tokens/cost are rolled up into
 * `agent_runs.total_tokens_in / total_tokens_out / total_cost_usd`.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callGemini } from "@/lib/ai/gemini";
import { estimateCostUsd } from "@/lib/ai/pricing";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

export const DEFAULT_AGENT_MODEL = "gemini-2.0-flash";

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
  /** Gemini responseSchema for structured JSON output. */
  schema?: Record<string, unknown>;
  /** agent_runs.id — when set, the call is written to agent_steps and rolled up onto the run. */
  runId?: string;
  /** Explicit agent_steps.seq; defaults to (max existing seq for the run) + 1. */
  stepSeq?: number;
  /** Stored as agent_steps.prompt_version. */
  promptVersion?: string;
  /** Sentry tag on failures, e.g. `agent.support-triage`. */
  featureKey?: string;
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

/**
 * Persist one model step and roll its usage up onto the parent run.
 * Best-effort: metering must never fail the agent workflow.
 */
export async function recordAgentModelStep(params: {
  runId: string;
  seq?: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  promptVersion?: string;
  schemaValid?: boolean | null;
  error?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const seq = params.seq ?? (await nextStepSeq(supabase, params.runId));
    await supabase.from("agent_steps").insert({
      run_id: params.runId,
      seq,
      kind: "model",
      model_provider: "gemini",
      model_id: params.model,
      prompt_version: params.promptVersion ?? null,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      cost_usd: params.costUsd,
      latency_ms: params.latencyMs,
      schema_valid: params.schemaValid ?? null,
      error: params.error ?? null,
    });

    // Read-modify-write rollup (agent runs are single-writer per run id, so this is race-safe enough
    // and avoids a new RPC; the step rows remain the source of truth for audits).
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
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("gemini_integration_config")
    .select("api_key_secret, default_model")
    .eq("environment", ENVIRONMENT)
    .eq("enabled", true)
    .maybeSingle();

  const apiKey = (data as { api_key_secret?: string } | null)?.api_key_secret;
  const model = (data as { default_model?: string } | null)?.default_model ?? DEFAULT_AGENT_MODEL;
  if (!apiKey) return { configured: false };

  const startedAt = Date.now();
  const result = await callGemini({
    apiKey,
    model,
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 800,
    schema: params.schema,
    timeoutMs: 60_000,
    featureKey: params.featureKey ?? "agent",
  });
  const latencyMs = Date.now() - startedAt;
  const costUsd = await estimateCostUsd(model, result.tokensIn, result.tokensOut);

  const failed = !result.success || !result.text.trim();
  if (params.runId) {
    await recordAgentModelStep({
      runId: params.runId,
      seq: params.stepSeq,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd,
      latencyMs,
      promptVersion: params.promptVersion,
      schemaValid: params.schema ? (failed ? false : isJsonParseable(result.text)) : null,
      error: failed ? (result.errorCode ?? "EMPTY_RESPONSE") : null,
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

/** Parse model JSON output tolerantly (strips code fences). Returns null on failure. */
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
