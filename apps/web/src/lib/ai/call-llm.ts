/**
 * Single server entry for all LLM calls (provider AI + agents).
 * Delegates to Vercel AI SDK when configured; falls back to callGemini for direct_gemini.
 */
import { generateObject, generateText, streamText, embed, jsonSchema } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  routeModel,
  pickFailoverModel,
  type ModelCatalogEntry,
  type ModelTask,
  DEFAULT_MODEL_CATALOG,
} from "@beautonomi/agent-model-router";
import { callGemini } from "@/lib/ai/gemini";
import { redactPii } from "@/lib/ai/pii-redact";
import type { LanguageModel } from "ai";
import {
  checkModelBreaker,
  recordModelFailure,
  recordModelSuccess,
  checkLlmProviderQuota,
  checkLlmTenantQuota,
} from "@/lib/ai/breaker";
import { resolveAiRuntime, type AiRuntimeMode } from "@/lib/ai/resolve-runtime";
import { isTierEqualOrCheaper } from "@/lib/ai/tier";
import { withRetry } from "@/lib/provider-portal/error-handler";

export interface LlmImageInput {
  url?: string;
  base64?: string;
  mime?: string;
}

export interface CallLlmParams {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  schema?: Record<string, unknown>;
  images?: LlmImageInput[];
  timeoutMs?: number;
  featureKey?: string;
  task?: ModelTask;
  riskTier?: number;
  providerId?: string;
  tenantId?: string | null;
  environment?: string;
  /** Explicit model override (must be in enabled catalog). */
  modelId?: string;
  /** Named failover model (agent_definitions.fallback_model_id). */
  fallbackModelId?: string | null;
  maxCostUsd?: number;
  spentUsd?: number;
  /** Admin credential probe — overrides resolved runtime for a single call. */
  forceRuntime?: AiRuntimeMode;
}

export interface CallLlmResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  errorCode?: string;
  model: string;
  modelProvider: string;
  runtime: AiRuntimeMode;
  gateway: boolean;
  breakerTripped?: boolean;
  failoverModel?: string;
  /** False when structured output fell back to text+JSON parse. */
  schemaValid?: boolean | null;
}

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const DEFAULT_ENVIRONMENT =
  ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

function geminiAlias(code: string): string {
  if (code === "LLM_RATE_LIMITED") return "GEMINI_RATE_LIMITED";
  if (code === "LLM_TIMEOUT") return "GEMINI_TIMEOUT";
  if (code.startsWith("LLM_") && /^\d+$/.test(code.slice(4))) return `GEMINI_${code.slice(4)}`;
  if (code === "LLM_NETWORK") return "GEMINI_NETWORK";
  return code;
}

async function reportLlmFailure(
  err: unknown,
  ctx: {
    featureKey?: string;
    model: string;
    provider: string;
    runtime: string;
    gateway: boolean;
    stage: string;
  },
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(error, {
      tags: {
        source: "llm",
        feature_key: ctx.featureKey ?? "unknown",
        model: ctx.model,
        provider: ctx.provider,
        runtime: ctx.runtime,
        gateway: String(ctx.gateway),
        stage: ctx.stage,
      },
    });
  } catch {
    // tests / local
  }
}

function findCatalogEntry(catalog: ModelCatalogEntry[], modelId: string): ModelCatalogEntry | null {
  return catalog.find((c) => c.id === modelId && c.enabled) ?? null;
}

function pickFailover(
  catalog: ModelCatalogEntry[],
  primary: ModelCatalogEntry,
  fallbackModelId?: string | null,
): ModelCatalogEntry | null {
  const named = pickFailoverModel(catalog, primary, fallbackModelId);
  if (named && isTierEqualOrCheaper(named.tier, primary.tier)) return named;
  const candidates = catalog.filter(
    (c) => c.enabled && c.id !== primary.id && isTierEqualOrCheaper(c.tier, primary.tier),
  );
  return candidates.slice().sort((a, b) => (a.inputUsdPer1k ?? Infinity) - (b.inputUsdPer1k ?? Infinity))[0] ?? null;
}

function buildSdkModel(
  runtime: AiRuntimeMode,
  modelId: string,
  gateway: boolean,
  keys: {
    gateway: string | null;
    openai: string | null;
    anthropic: string | null;
    gemini: string | null;
  },
) {
  if ((runtime === "vercel_gateway" || gateway) && keys.gateway) {
    const openai = createOpenAI({
      apiKey: keys.gateway,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
    return openai(modelId);
  }
  if (runtime === "direct_openai" && keys.openai) {
    const bareId = modelId.replace(/^openai\//, "");
    return createOpenAI({ apiKey: keys.openai })(bareId);
  }
  if (runtime === "direct_anthropic" && keys.anthropic) {
    const bareId = modelId.replace(/^anthropic\//, "");
    return createAnthropic({ apiKey: keys.anthropic })(bareId);
  }
  if (runtime === "direct_gemini" && keys.gemini) {
    const google = createGoogleGenerativeAI({ apiKey: keys.gemini });
    const bareId = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
    return google(bareId);
  }
  const provider = modelId.includes("/") ? modelId.split("/")[0] : "google";
  if (provider === "google" || provider === "gemini") {
    if (!keys.gemini) return null;
    const google = createGoogleGenerativeAI({ apiKey: keys.gemini });
    const bareId = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
    return google(bareId);
  }
  if (provider === "openai" && keys.openai) {
    return createOpenAI({ apiKey: keys.openai })(modelId.replace(/^openai\//, ""));
  }
  if (provider === "anthropic" && keys.anthropic) {
    return createAnthropic({ apiKey: keys.anthropic })(modelId.replace(/^anthropic\//, ""));
  }
  return null;
}

async function invokeSdk(params: {
  modelId: string;
  entry: ModelCatalogEntry;
  runtime: AiRuntimeMode;
  keys: ResolvedKeys;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  schema?: Record<string, unknown>;
  images?: LlmImageInput[];
  timeoutMs: number;
  featureKey?: string;
}): Promise<{ text: string; tokensIn: number; tokensOut: number; schemaValid?: boolean | null }> {
  const sdkModel = buildSdkModel(params.runtime, params.modelId, params.entry.gateway, params.keys);
  if (!sdkModel) {
    throw new Error("sdk_model_unavailable");
  }

  const abortSignal = AbortSignal.timeout(Math.max(params.timeoutMs, 1_000));

  const userContent =
    params.images?.length
      ? [
          { type: "text" as const, text: params.user },
          ...params.images
            .filter((img) => img.url || img.base64)
            .map((img) =>
              img.url
                ? ({ type: "image" as const, image: img.url })
                : ({ type: "image" as const, image: `data:${img.mime ?? "image/jpeg"};base64,${img.base64}` }),
            ),
        ]
      : params.user;

  if (params.schema) {
    const objectArgs = {
      model: sdkModel,
      schema: jsonSchema(params.schema),
      system: params.system || undefined,
      temperature: params.temperature,
      maxOutputTokens: params.maxTokens,
      abortSignal,
    };
    try {
      const result = params.images?.length
        ? await generateObject({
            ...objectArgs,
            messages: [{ role: "user" as const, content: userContent }],
          })
        : await generateObject({
            ...objectArgs,
            prompt: params.user,
          });
      return {
        text: JSON.stringify(result.object),
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
        schemaValid: true,
      };
    } catch {
      const fallbackUser = `${params.user}\n\nRespond with valid JSON only, matching this schema:\n${JSON.stringify(params.schema)}`;
      const result = await generateText({
        model: sdkModel,
        system: params.system || undefined,
        ...(params.images?.length
          ? { messages: [{ role: "user" as const, content: userContent }] }
          : { prompt: fallbackUser }),
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        abortSignal,
      });
      return {
        text: result.text,
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
        schemaValid: false,
      };
    }
  }

  const result = await generateText({
    model: sdkModel,
    system: params.system || undefined,
    ...(params.images?.length
      ? { messages: [{ role: "user" as const, content: userContent }] }
      : { prompt: params.user }),
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens,
    abortSignal,
  });
  return {
    text: result.text,
    tokensIn: result.usage?.inputTokens ?? 0,
    tokensOut: result.usage?.outputTokens ?? 0,
  };
}

type ResolvedKeys = {
  gateway: string | null;
  openai: string | null;
  anthropic: string | null;
  gemini: string | null;
};

async function loadGeminiSafetySettings(environment: string): Promise<Record<string, unknown> | undefined> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("gemini_integration_config")
      .select("safety_settings")
      .eq("environment", environment)
      .is("tenant_id", null)
      .maybeSingle();
    const settings = (data as { safety_settings?: Record<string, unknown> } | null)?.safety_settings;
    return settings && Object.keys(settings).length > 0 ? settings : undefined;
  } catch {
    return undefined;
  }
}

async function invokeDirectGemini(params: {
  modelId: string;
  keys: ResolvedKeys;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  schema?: Record<string, unknown>;
  images?: LlmImageInput[];
  timeoutMs: number;
  featureKey?: string;
  providerId?: string;
  environment?: string;
}): Promise<CallLlmResult> {
  if (!params.keys.gemini) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_NOT_CONFIGURED",
      model: params.modelId,
      modelProvider: "gemini",
      runtime: "direct_gemini",
      gateway: false,
    };
  }
  const safetySettings = await loadGeminiSafetySettings(params.environment ?? DEFAULT_ENVIRONMENT);
  const result = await callGemini({
    apiKey: params.keys.gemini,
    model: params.modelId,
    system: params.system,
    user: params.user,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    schema: params.schema,
    images: params.images,
    safetySettings,
    timeoutMs: params.timeoutMs,
    featureKey: params.featureKey,
    providerId: params.providerId,
  });
  const errorCode = result.errorCode ? geminiAlias(result.errorCode.replace("GEMINI_", "LLM_")) : undefined;
  return {
    text: result.text,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    success: result.success,
    errorCode: result.errorCode ?? errorCode,
    model: params.modelId,
    modelProvider: "gemini",
    runtime: "direct_gemini",
    gateway: false,
  };
}

async function invokeOnce(
  modelId: string,
  entry: ModelCatalogEntry,
  params: CallLlmParams,
  runtime: AiRuntimeMode,
  keys: ResolvedKeys,
): Promise<CallLlmResult> {
  const system = redactPii(params.system ?? "");
  const user = redactPii(params.user);
  const temperature = params.temperature ?? 0.3;
  const maxTokens = params.maxTokens ?? 600;
  const timeoutMs = params.timeoutMs ?? 20_000;

  const breaker = await checkModelBreaker(modelId);
  if (!breaker.allowed) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_BREAKER_OPEN",
      model: modelId,
      modelProvider: entry.provider,
      runtime,
      gateway: entry.gateway,
      breakerTripped: true,
    };
  }

  try {
    if (runtime === "direct_gemini" && !entry.gateway) {
      const geminiResult = await invokeDirectGemini({
        modelId,
        keys,
        system,
        user,
        temperature,
        maxTokens,
        schema: params.schema,
        images: params.images,
        timeoutMs,
        featureKey: params.featureKey,
        providerId: params.providerId,
        environment: params.environment ?? DEFAULT_ENVIRONMENT,
      });
      if (geminiResult.success) recordModelSuccess(modelId);
      else recordModelFailure(modelId, params.environment ?? DEFAULT_ENVIRONMENT);
      return geminiResult;
    }

    const out = await withRetry(
      () =>
        invokeSdk({
          modelId,
          entry,
          runtime,
          keys,
          system,
          user,
          temperature,
          maxTokens,
          schema: params.schema,
          images: params.images,
          timeoutMs,
          featureKey: params.featureKey,
        }),
      { maxRetries: 1, retryDelay: 400 },
    );
    recordModelSuccess(modelId);
    return {
      text: out.text,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
      success: true,
      model: modelId,
      modelProvider: entry.provider,
      runtime,
      gateway: entry.gateway,
      schemaValid: out.schemaValid ?? null,
    };
  } catch (err) {
    recordModelFailure(modelId, params.environment ?? DEFAULT_ENVIRONMENT);
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || err.message.includes("timed out"));
    await reportLlmFailure(err, {
      featureKey: params.featureKey,
      model: modelId,
      provider: entry.provider,
      runtime,
      gateway: entry.gateway,
      stage: isTimeout ? "timeout" : "invoke",
    });
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: isTimeout ? "LLM_TIMEOUT" : "LLM_NETWORK",
      model: modelId,
      modelProvider: entry.provider,
      runtime,
      gateway: entry.gateway,
    };
  }
}

export async function callLlm(params: CallLlmParams): Promise<CallLlmResult> {
  const environment = params.environment ?? DEFAULT_ENVIRONMENT;
  const resolved = await resolveAiRuntime(environment, params.tenantId ?? null);

  if (params.images?.length && resolved.emergency.disableVision) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_BLOCKED_BY_KILL_SWITCH",
      model: "",
      modelProvider: "",
      runtime: resolved.config.runtime,
      gateway: false,
    };
  }

  if (resolved.emergency.stopAllCalls || resolved.emergency.forceTemplateFallback) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_BLOCKED_BY_KILL_SWITCH",
      model: "",
      modelProvider: "",
      runtime: resolved.config.runtime,
      gateway: false,
    };
  }

  if (!resolved.config.enabled) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_NOT_CONFIGURED",
      model: "",
      modelProvider: "",
      runtime: resolved.config.runtime,
      gateway: false,
    };
  }

  if (params.providerId && !(await checkLlmProviderQuota(params.providerId))) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_RATE_LIMITED",
      model: "",
      modelProvider: "",
      runtime: resolved.config.runtime,
      gateway: false,
    };
  }

  if (params.tenantId && !(await checkLlmTenantQuota(params.tenantId))) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_RATE_LIMITED",
      model: "",
      modelProvider: "",
      runtime: resolved.config.runtime,
      gateway: false,
    };
  }

  const catalog = resolved.catalog.length ? resolved.catalog : DEFAULT_MODEL_CATALOG;
  const keys: ResolvedKeys = {
    gateway: resolved.config.gatewayApiKey,
    openai: resolved.config.openaiApiKey,
    anthropic: resolved.config.anthropicApiKey,
    gemini: resolved.config.geminiApiKey,
  };
  const effectiveRuntime = params.forceRuntime ?? resolved.config.runtime;

  let modelId = params.modelId;
  if (!modelId) {
    const routed = routeModel({
      task: params.task ?? "drafting",
      riskTier: params.riskTier ?? 0,
      contextTokens: 500,
      escalationSignals: [],
      escalationCount: 0,
      maxEscalations: 2,
      maxCostUsd: params.maxCostUsd ?? 1,
      spentUsd: params.spentUsd ?? 0,
      catalog,
    });
    modelId = routed.modelId;
  } else if (!findCatalogEntry(catalog, modelId)) {
    modelId = resolved.config.defaultModelId;
  }

  let entry = findCatalogEntry(catalog, modelId) ?? catalog.find((c) => c.enabled) ?? catalog[0];
  if (!entry) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "LLM_MODEL_NOT_ALLOWED",
      model: modelId,
      modelProvider: "unknown",
      runtime: effectiveRuntime,
      gateway: false,
    };
  }

  let result = await invokeOnce(entry.id, entry, params, effectiveRuntime, keys);

  if (
    !result.success &&
    resolved.config.failoverEnabled &&
    !params.forceRuntime &&
    (result.errorCode === "LLM_BREAKER_OPEN" ||
      result.errorCode === "LLM_TIMEOUT" ||
      result.errorCode === "LLM_NETWORK")
  ) {
    const failover = pickFailover(catalog, entry, params.fallbackModelId);
    if (failover) {
      const second = await invokeOnce(failover.id, failover, params, effectiveRuntime, keys);
      if (second.success) {
        return { ...second, failoverModel: failover.id };
      }
    }
  }

  if (result.errorCode === "LLM_RATE_LIMITED") {
    result = { ...result, errorCode: geminiAlias("LLM_RATE_LIMITED") };
  }

  return result;
}

export type StreamLlmParams = CallLlmParams & {
  onFinish?: (result: {
    text: string;
    tokensIn: number;
    tokensOut: number;
    model: string;
    modelProvider: string;
    runtime: AiRuntimeMode;
    gateway: boolean;
  }) => void | Promise<void>;
};

/** Stream text with the same preflight checks as callLlm (minus structured output). */
export async function streamLlm(params: StreamLlmParams) {
  const environment = params.environment ?? DEFAULT_ENVIRONMENT;
  const resolved = await resolveAiRuntime(environment, params.tenantId ?? null);

  if (
    params.images?.length &&
    resolved.emergency.disableVision
  ) {
    throw new Error("LLM_BLOCKED_BY_KILL_SWITCH");
  }
  if (
    resolved.emergency.disableStreaming ||
    resolved.emergency.stopAllCalls ||
    resolved.emergency.forceTemplateFallback
  ) {
    throw new Error("LLM_STREAMING_DISABLED");
  }
  if (!resolved.config.enabled) {
    throw new Error("LLM_NOT_CONFIGURED");
  }
  if (params.providerId && !(await checkLlmProviderQuota(params.providerId))) {
    throw new Error("LLM_RATE_LIMITED");
  }
  if (params.tenantId && !(await checkLlmTenantQuota(params.tenantId))) {
    throw new Error("LLM_RATE_LIMITED");
  }

  const catalog = resolved.catalog.length ? resolved.catalog : DEFAULT_MODEL_CATALOG;
  const keys: ResolvedKeys = {
    gateway: resolved.config.gatewayApiKey,
    openai: resolved.config.openaiApiKey,
    anthropic: resolved.config.anthropicApiKey,
    gemini: resolved.config.geminiApiKey,
  };
  const effectiveRuntime = params.forceRuntime ?? resolved.config.runtime;

  let modelId = params.modelId;
  if (!modelId) {
    const routed = routeModel({
      task: params.task ?? "drafting",
      riskTier: params.riskTier ?? 0,
      contextTokens: 500,
      escalationSignals: [],
      escalationCount: 0,
      maxEscalations: 2,
      maxCostUsd: params.maxCostUsd ?? 1,
      spentUsd: params.spentUsd ?? 0,
      catalog,
    });
    modelId = routed.modelId;
  } else if (!findCatalogEntry(catalog, modelId)) {
    modelId = resolved.config.defaultModelId;
  }

  let entry = findCatalogEntry(catalog, modelId) ?? catalog.find((c) => c.enabled) ?? catalog[0];
  if (!entry) throw new Error("LLM_MODEL_NOT_ALLOWED");

  const sdkModel = buildSdkModel(effectiveRuntime, entry.id, entry.gateway, keys);
  if (!sdkModel) throw new Error("sdk_model_unavailable");

  const system = redactPii(params.system ?? "");
  const user = redactPii(params.user);
  const temperature = params.temperature ?? 0.3;
  const maxTokens = params.maxTokens ?? 600;
  const timeoutMs = params.timeoutMs ?? 20_000;

  return streamText({
    model: sdkModel as LanguageModel,
    system: system || undefined,
    prompt: user,
    temperature,
    maxOutputTokens: maxTokens,
    abortSignal: AbortSignal.timeout(Math.max(timeoutMs, 1_000)),
    onFinish: async (event) => {
      await params.onFinish?.({
        text: event.text,
        tokensIn: event.usage?.inputTokens ?? 0,
        tokensOut: event.usage?.outputTokens ?? 0,
        model: entry.id,
        modelProvider: entry.provider,
        runtime: resolved.config.runtime,
        gateway: entry.gateway,
      });
    },
  });
}

export { streamText, embed, generateText, generateObject };
