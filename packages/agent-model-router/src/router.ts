/**
 * Provider-independent model router.
 *
 * Models are described by catalog entries, not hard-coded branches, so any model
 * reachable through the Vercel AI Gateway (`provider/model-id` format) or a direct
 * provider SDK can be added without changing routing logic. The default catalog
 * ships Gemini (current platform integration); future OpenAI/Anthropic/xAI/etc.
 * entries only need a catalog row + routing policy update (persistable in
 * agent_module_config.default_routing_policy_id).
 */

export type ModelProvider = "gemini" | "openai" | "anthropic" | "xai" | "mistral" | "meta" | (string & {});

export type ModelTier = "lite" | "flash" | "pro";

export type ModelCatalogEntry = {
  /** Plain provider model ID (e.g. "gemini-2.5-flash") or Vercel AI Gateway ID (e.g. "openai/gpt-5"). */
  id: string;
  provider: ModelProvider;
  tier: ModelTier;
  /** True when the ID is in Vercel AI Gateway `provider/model` format. */
  gateway: boolean;
  enabled: boolean;
};

/** Current Gemini model IDs — verify against Google model list at deploy time. */
export const GEMINI_MODELS = {
  flashLite: "gemini-2.5-flash-lite",
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
} as const;

export const DEFAULT_MODEL_CATALOG: ModelCatalogEntry[] = [
  { id: GEMINI_MODELS.flashLite, provider: "gemini", tier: "lite", gateway: false, enabled: true },
  { id: GEMINI_MODELS.flash, provider: "gemini", tier: "flash", gateway: false, enabled: true },
  { id: GEMINI_MODELS.pro, provider: "gemini", tier: "pro", gateway: false, enabled: true },
];

/** Parse a Vercel AI Gateway model ID ("provider/model") into a catalog entry. */
export function catalogEntryFromGatewayId(
  gatewayId: string,
  tier: ModelTier,
  enabled = true,
): ModelCatalogEntry {
  const slash = gatewayId.indexOf("/");
  const provider = slash > 0 ? gatewayId.slice(0, slash) : "gemini";
  return { id: gatewayId, provider, tier, gateway: slash > 0, enabled };
}

export type ModelTask =
  | "classification"
  | "extraction"
  | "drafting"
  | "summarization"
  | "complex_reasoning"
  | "copilot";

export type EscalationSignal =
  | "schema_validation_failure"
  | "missing_evidence"
  | "conflicting_tool_results"
  | "policy_ambiguity"
  | "unsupported_task"
  | "high_financial_amount"
  | "high_risk_action"
  | "repeated_inconsistent_output"
  | "tool_call_failure"
  | "eval_weak_category";

export type RouteRequest = {
  task: ModelTask;
  riskTier: number;
  contextTokens: number;
  escalationSignals: EscalationSignal[];
  escalationCount: number;
  maxEscalations: number;
  maxCostUsd: number;
  spentUsd: number;
  /** Optional override catalog (e.g. loaded from control-plane config). Defaults to Gemini. */
  catalog?: ModelCatalogEntry[];
};

export type RouteResult = {
  provider: ModelProvider;
  modelId: string;
  tier: ModelTier;
  /** True when modelId must be invoked through the Vercel AI Gateway. */
  gateway: boolean;
  shouldStop: boolean;
  stopReason?: string;
};

const COMPLEX_SIGNALS = new Set<EscalationSignal>([
  "schema_validation_failure",
  "missing_evidence",
  "conflicting_tool_results",
  "policy_ambiguity",
  "high_financial_amount",
  "high_risk_action",
  "repeated_inconsistent_output",
  "eval_weak_category",
]);

function pickModel(catalog: ModelCatalogEntry[], tier: ModelTier): ModelCatalogEntry {
  const enabled = catalog.filter((m) => m.enabled);
  const exact = enabled.find((m) => m.tier === tier);
  if (exact) return exact;
  // Degrade gracefully: pro -> flash -> lite, never silently upgrade cost.
  const order: ModelTier[] = tier === "pro" ? ["flash", "lite"] : tier === "flash" ? ["lite"] : [];
  for (const t of order) {
    const found = enabled.find((m) => m.tier === t);
    if (found) return found;
  }
  const any = enabled[0] ?? catalog[0];
  if (!any) throw new Error("model_catalog_empty");
  return any;
}

function toResult(entry: ModelCatalogEntry, shouldStop: boolean, stopReason?: string): RouteResult {
  return {
    provider: entry.provider,
    modelId: entry.id,
    tier: entry.tier,
    gateway: entry.gateway,
    shouldStop,
    stopReason,
  };
}

export function routeModel(req: RouteRequest): RouteResult {
  const catalog = req.catalog?.length ? req.catalog : DEFAULT_MODEL_CATALOG;
  if (req.escalationCount >= req.maxEscalations) {
    return toResult(pickModel(catalog, "lite"), true, "max_escalations");
  }
  if (req.spentUsd >= req.maxCostUsd) {
    return toResult(pickModel(catalog, "lite"), true, "cost_cap");
  }
  const needsFlash =
    req.task === "complex_reasoning" ||
    req.task === "copilot" ||
    req.riskTier >= 2 ||
    req.escalationSignals.some((s) => COMPLEX_SIGNALS.has(s));

  if (needsFlash && req.riskTier >= 3) {
    return toResult(pickModel(catalog, "pro"), false);
  }
  if (needsFlash) {
    return toResult(pickModel(catalog, "flash"), false);
  }
  return toResult(pickModel(catalog, "lite"), false);
}
