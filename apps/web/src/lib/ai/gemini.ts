/**
 * Server-only Gemini API client.
 * API key must be passed from gemini_integration_config (never from env in this module).
 *
 * Rate limiting uses the shared Upstash-backed store (`@/lib/rate-limit/store`) so the
 * per-provider quota holds across serverless instances; the store falls back to an
 * in-process window when Upstash env is absent.
 */
import { checkRateLimit } from "@/lib/rate-limit/store";

export interface CallGeminiParams {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  schema?: Record<string, any>;
  /** Request timeout in ms (default 20s). Agent callers may pass 60s. */
  timeoutMs?: number;
  /** Used only for Sentry tagging on failures (e.g. `ai.provider.content_studio`, `agent.support-triage`). */
  featureKey?: string;
}

export interface CallGeminiResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  errorCode?: string;
}

interface GeminiCandidatePart {
  text?: string;
}
interface GeminiCandidateContent {
  parts?: GeminiCandidatePart[];
}
interface GeminiCandidate {
  content?: GeminiCandidateContent;
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

export const GEMINI_PROVIDER_RATE_LIMIT = {
  prefix: "gemini:provider",
  limit: 30,
  windowSeconds: 60,
} as const;

async function checkGeminiQuota(providerId: string): Promise<boolean> {
  try {
    const result = await checkRateLimit(GEMINI_PROVIDER_RATE_LIMIT, providerId);
    return result.allowed;
  } catch (err) {
    // A limiter outage must never take AI features down; fail open and report.
    await reportGeminiFailure(err, { featureKey: "rate_limit", model: "n/a", stage: "rate_limit" });
    return true;
  }
}

async function reportGeminiFailure(
  err: unknown,
  ctx: { featureKey?: string; model: string; stage: string; status?: number },
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(error, {
      tags: {
        source: "gemini",
        feature_key: ctx.featureKey ?? "unknown",
        model: ctx.model,
        stage: ctx.stage,
        ...(ctx.status != null ? { http_status: String(ctx.status) } : {}),
      },
    });
  } catch {
    // Sentry unavailable in this runtime (tests / local); swallow.
  }
}

/**
 * Call Gemini generateContent. Returns raw text and token counts.
 * Enforces a per-provider rate limit of 30 requests/minute (shared across instances via Upstash).
 */
export async function callGemini(params: CallGeminiParams & { providerId?: string }): Promise<CallGeminiResult> {
  if (params.providerId && !(await checkGeminiQuota(params.providerId))) {
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "GEMINI_RATE_LIMITED",
    };
  }

  const {
    apiKey,
    model,
    system = "",
    user,
    temperature = 0.3,
    maxTokens = 600,
    schema,
    timeoutMs = 20_000,
    featureKey,
  } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = schema;
  }

  const body: Record<string, any> = {
    contents: [{ parts: [{ text: user }] }],
    generationConfig,
  };
  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(timeoutMs, 1_000)),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMessage = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
      // 429 is quota pressure, not a defect; everything else is worth a Sentry event.
      if (res.status !== 429) {
        await reportGeminiFailure(new Error(`Gemini ${res.status}: ${errMessage}`), {
          featureKey,
          model,
          stage: "http",
          status: res.status,
        });
      }
      return {
        text: "",
        tokensIn: 0,
        tokensOut: 0,
        success: false,
        errorCode: `GEMINI_${res.status}`,
      };
    }

    const payload = data as GeminiResponse;
    const candidates = payload.candidates;
    const candidate = candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const usage = payload.usageMetadata;
    const tokensIn = usage?.promptTokenCount ?? 0;
    const tokensOut = usage?.candidatesTokenCount ?? usage?.totalTokenCount ?? 0;

    return { text, tokensIn, tokensOut, success: true };
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || err.message.includes("timed out"));
    console.error("Gemini call error:", err);
    await reportGeminiFailure(err, { featureKey, model, stage: isTimeout ? "timeout" : "network" });
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: isTimeout ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK",
    };
  }
}
