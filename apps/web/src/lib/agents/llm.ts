/**
 * Shared LLM access for agent workflows. Uses the platform Gemini integration
 * (gemini_integration_config) when enabled; callers must always handle the
 * `configured: false` / failure path with a deterministic fallback so agents
 * degrade gracefully instead of breaking.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callGemini } from "@/lib/ai/gemini";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

export type AgentLlmResult =
  | { configured: false }
  | { configured: true; success: false; errorCode?: string }
  | { configured: true; success: true; text: string; model: string; tokensIn: number; tokensOut: number };

export async function callAgentLlm(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Gemini responseSchema for structured JSON output. */
  schema?: Record<string, unknown>;
}): Promise<AgentLlmResult> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("gemini_integration_config")
    .select("api_key_secret, default_model")
    .eq("environment", ENVIRONMENT)
    .eq("enabled", true)
    .maybeSingle();

  const apiKey = (data as { api_key_secret?: string } | null)?.api_key_secret;
  const model = (data as { default_model?: string } | null)?.default_model ?? "gemini-2.0-flash";
  if (!apiKey) return { configured: false };

  const result = await callGemini({
    apiKey,
    model,
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 800,
    schema: params.schema,
  });

  if (!result.success || !result.text.trim()) {
    return { configured: true, success: false, errorCode: result.errorCode };
  }
  return {
    configured: true,
    success: true,
    text: result.text,
    model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
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
