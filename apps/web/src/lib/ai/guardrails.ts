/** Shared AI platform guardrail constants (see docs/AI_PROVIDER.md). */

export const AI_SECRET_REDACT_KEYS = [
  "api_key_secret",
  "gateway_api_key_secret",
  "openai_api_key_secret",
  "anthropic_api_key_secret",
] as const;

export const LLM_ERROR_CODES = {
  RATE_LIMITED: "LLM_RATE_LIMITED",
  TIMEOUT: "LLM_TIMEOUT",
  NETWORK: "LLM_NETWORK",
  SCHEMA_INVALID: "LLM_SCHEMA_INVALID",
  BLOCKED_BY_KILL_SWITCH: "LLM_BLOCKED_BY_KILL_SWITCH",
  NOT_CONFIGURED: "LLM_NOT_CONFIGURED",
  MODEL_NOT_ALLOWED: "LLM_MODEL_NOT_ALLOWED",
  BREAKER_OPEN: "LLM_BREAKER_OPEN",
} as const;

/** Gemini alias codes kept for one release for downstream compatibility. */
export const GEMINI_ERROR_ALIASES: Record<string, string> = {
  LLM_RATE_LIMITED: "GEMINI_RATE_LIMITED",
  LLM_TIMEOUT: "GEMINI_TIMEOUT",
  LLM_NETWORK: "GEMINI_NETWORK",
};
