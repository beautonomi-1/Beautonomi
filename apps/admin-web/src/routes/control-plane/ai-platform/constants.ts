export const RUNTIMES = [
  { value: "vercel_gateway", label: "Vercel AI Gateway (recommended)" },
  { value: "direct_gemini", label: "Direct Gemini (rollback / legacy)" },
  { value: "direct_openai", label: "Direct OpenAI" },
  { value: "direct_anthropic", label: "Direct Anthropic" },
] as const;

export const TIERS = ["lite", "flash", "pro"] as const;

export const TASK_DEFAULTS = [
  "classification",
  "extraction",
  "drafting",
  "summarization",
  "complex_reasoning",
  "copilot",
] as const;

export const HARM_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
] as const;

export const THRESHOLDS = [
  "BLOCK_NONE",
  "BLOCK_ONLY_HIGH",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_LOW_AND_ABOVE",
] as const;

export const PRESETS = [
  { id: "gateway_cheap_global", label: "Cheap global (recommended)" },
  { id: "gemini_only", label: "Gemini only (rollback)" },
  { id: "gateway_balanced", label: "Gateway balanced" },
  { id: "gateway_premium", label: "Gateway premium" },
] as const;

export const PRESET_HINTS: Record<string, string> = {
  gateway_cheap_global:
    "Gateway-first open-weight stack (Qwen/DeepSeek/GLM). Est. ~$0.03–0.08 / 1k calls.",
  gemini_only: "Direct Gemini lite/flash/pro. Est. ~$0.05 / 1k calls.",
  gateway_balanced: "Gateway lite + OpenAI mini. Est. ~$0.15 / 1k calls.",
  gateway_premium: "Adds Claude Sonnet for high-risk. Est. ~$0.45 / 1k calls.",
};

export const CAPABILITY_FILTERS = ["all", "chat", "vision", "embedding"] as const;

export const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  gateway: "Gateway",
  workforce: "Workforce",
  budgets: "Budgets & usage",
  safety: "Safety & emergency",
};
