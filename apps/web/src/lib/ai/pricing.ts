/**
 * Per-model AI pricing (ai_model_pricing, migration 874). Server-only.
 *
 * `estimateCostUsd()` turns Gemini usage metadata into a USD estimate for
 * `ai_usage_log.cost_estimate`, `agent_steps.cost_usd` and the `agent_runs`
 * rollup, which is what `enforceAiBudget` sums against `global_daily_spend_cap_usd`.
 *
 * The table is cached in-process for 5 minutes; when a model has no active row
 * we fall back to the in-code defaults below (mirrors the migration seed) so a
 * missing row never zeroes out spend tracking.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface ModelPricing {
  model: string;
  /** USD per 1,000 input (prompt) tokens. */
  inputUsdPer1k: number;
  /** USD per 1,000 output (candidate) tokens. */
  outputUsdPer1k: number;
}

export const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

/** Mirrors the seed in supabase/migrations/874_ai_model_pricing.sql. */
export const DEFAULT_MODEL_PRICING: Record<string, Omit<ModelPricing, "model">> = {
  "gemini-2.5-flash-lite": { inputUsdPer1k: 0.0001, outputUsdPer1k: 0.0004 },
  "gemini-2.5-flash": { inputUsdPer1k: 0.0003, outputUsdPer1k: 0.0025 },
  "gemini-2.5-pro": { inputUsdPer1k: 0.00125, outputUsdPer1k: 0.01 },
  "gemini-2.0-flash": { inputUsdPer1k: 0.0001, outputUsdPer1k: 0.0004 },
};

/** Used when the model is unknown to both the table and the defaults (priced like flash). */
const UNKNOWN_MODEL_PRICING: Omit<ModelPricing, "model"> = { inputUsdPer1k: 0.0003, outputUsdPer1k: 0.0025 };

let cache: { loadedAt: number; byModel: Map<string, ModelPricing> } | null = null;
let inflight: Promise<Map<string, ModelPricing>> | null = null;

function defaultsAsMap(): Map<string, ModelPricing> {
  return new Map(
    Object.entries(DEFAULT_MODEL_PRICING).map(([model, p]) => [model, { model, ...p }]),
  );
}

async function fetchPricing(): Promise<Map<string, ModelPricing>> {
  const byModel = defaultsAsMap();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_model_pricing")
      .select("model, input_usd_per_1k, output_usd_per_1k, is_active, effective_from")
      .eq("is_active", true)
      .lte("effective_from", new Date().toISOString());
    if (!error) {
      for (const row of (data ?? []) as Array<{
        model: string;
        input_usd_per_1k: number | string;
        output_usd_per_1k: number | string;
      }>) {
        byModel.set(row.model, {
          model: row.model,
          inputUsdPer1k: Number(row.input_usd_per_1k),
          outputUsdPer1k: Number(row.output_usd_per_1k),
        });
      }
    }
  } catch {
    // Table missing / DB hiccup: keep the in-code defaults.
  }
  return byModel;
}

/** Load the active pricing table (cached 5 minutes, single in-flight fetch). */
export async function loadModelPricing(): Promise<Map<string, ModelPricing>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < PRICING_CACHE_TTL_MS) return cache.byModel;
  if (!inflight) {
    inflight = fetchPricing()
      .then((byModel) => {
        cache = { loadedAt: Date.now(), byModel };
        return byModel;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test hook. */
export function clearModelPricingCache(): void {
  cache = null;
  inflight = null;
}

/** Pure cost computation; exported for callers that already hold a pricing row. */
export function computeCostUsd(
  pricing: Omit<ModelPricing, "model">,
  inputTokens: number,
  outputTokens: number,
): number {
  const tokensIn = Math.max(0, Number(inputTokens) || 0);
  const tokensOut = Math.max(0, Number(outputTokens) || 0);
  const usd = (tokensIn / 1000) * pricing.inputUsdPer1k + (tokensOut / 1000) * pricing.outputUsdPer1k;
  // ai_usage_log.cost_estimate / agent_steps.cost_usd are NUMERIC(12,6).
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Resolve pricing for a model: table row -> in-code default -> unknown-model fallback. */
export async function getModelPricing(model: string): Promise<ModelPricing> {
  const byModel = await loadModelPricing();
  const hit = byModel.get(model);
  if (hit) return hit;
  return { model, ...UNKNOWN_MODEL_PRICING };
}

/**
 * Estimate USD cost for one model call from Gemini usage metadata
 * (`promptTokenCount` -> inputTokens, `candidatesTokenCount` -> outputTokens).
 */
export async function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const pricing = await getModelPricing(model);
  return computeCostUsd(pricing, inputTokens, outputTokens);
}
