/**
 * Load env/tenant-scoped AI runtime, catalog, and emergency controls.
 * Falls back to gemini_integration_config when ai_runtime_config is absent.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { type ModelCatalogEntry } from "@beautonomi/agent-model-router";
import { buildMergedCatalog, type DbCatalogRow } from "@/lib/ai/merge-catalog";

export type AiRuntimeMode = "direct_gemini" | "vercel_gateway" | "direct_openai" | "direct_anthropic";

export type AiRuntimeConfig = {
  enabled: boolean;
  runtime: AiRuntimeMode;
  defaultModelId: string;
  failoverEnabled: boolean;
  gatewayApiKey: string | null;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  geminiApiKey: string | null;
};

export type AiEmergencyControls = {
  stopAllCalls: boolean;
  forceTemplateFallback: boolean;
  disableStreaming: boolean;
  disableVision: boolean;
  disableEmbeddings: boolean;
};

export type ResolvedAiRuntime = {
  config: AiRuntimeConfig;
  catalog: ModelCatalogEntry[];
  emergency: AiEmergencyControls;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: ResolvedAiRuntime }>();

function cacheKey(environment: string, tenantId: string | null): string {
  return `${environment}:${tenantId ?? "global"}`;
}

function defaultEmergency(): AiEmergencyControls {
  return {
    stopAllCalls: false,
    forceTemplateFallback: false,
    disableStreaming: false,
    disableVision: false,
    disableEmbeddings: false,
  };
}

async function loadGeminiFallback(environment: string, tenantId: string | null): Promise<AiRuntimeConfig> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("gemini_integration_config")
    .select("api_key_secret, default_model, enabled")
    .eq("environment", environment);
  query = tenantId ? query.eq("tenant_id", tenantId) : query.is("tenant_id", null);
  const { data } = await query.maybeSingle();
  const row = data as { api_key_secret?: string; default_model?: string; enabled?: boolean } | null;
  return {
    enabled: Boolean(row?.enabled),
    runtime: "direct_gemini",
    defaultModelId: row?.default_model ?? "gemini-2.5-flash-lite",
    failoverEnabled: true,
    gatewayApiKey: null,
    openaiApiKey: null,
    anthropicApiKey: null,
    geminiApiKey: row?.api_key_secret ?? null,
  };
}

export async function resolveAiRuntime(
  environment: string,
  tenantId: string | null = null,
): Promise<ResolvedAiRuntime> {
  const key = cacheKey(environment, tenantId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const supabase = getSupabaseAdmin();
  let config: AiRuntimeConfig;
  let catalog: ModelCatalogEntry[] = [];

  async function loadRuntimeRow(): Promise<Record<string, unknown> | null> {
    if (tenantId) {
      const { data: tenantRow } = await supabase
        .from("ai_runtime_config")
        .select("*")
        .eq("environment", environment)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (tenantRow) return tenantRow as Record<string, unknown>;
    }
    const { data: globalRow } = await supabase
      .from("ai_runtime_config")
      .select("*")
      .eq("environment", environment)
      .is("tenant_id", null)
      .maybeSingle();
    return (globalRow as Record<string, unknown> | null) ?? null;
  }

  async function loadCatalogRows(): Promise<DbCatalogRow[]> {
    const mapRows = (rows: unknown[]) =>
      rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string | undefined,
          model_id: String(r.model_id),
          provider: r.provider as string | undefined,
          tier: r.tier as string | undefined,
          capability: r.capability as string | undefined,
          gateway: r.gateway as boolean | undefined,
          enabled: r.enabled as boolean | undefined,
          eval_passed_at: (r.eval_passed_at as string | null | undefined) ?? null,
        };
      });

    if (tenantId) {
      const { data: tenantRows } = await supabase
        .from("ai_model_catalog")
        .select("model_id, provider, tier, gateway, enabled, capability")
        .eq("environment", environment)
        .eq("tenant_id", tenantId);
      if (tenantRows?.length) return mapRows(tenantRows);
    }
    const { data: globalRows } = await supabase
      .from("ai_model_catalog")
      .select("model_id, provider, tier, gateway, enabled, capability")
      .eq("environment", environment)
      .is("tenant_id", null);
    return mapRows(globalRows ?? []);
  }

  const runtimeRow = await loadRuntimeRow();

  if (!runtimeRow) {
    config = await loadGeminiFallback(environment, tenantId);
  } else {
    const r = runtimeRow;
    const geminiFallback = await loadGeminiFallback(environment, tenantId);
    config = {
      enabled: Boolean(r.enabled),
      runtime: (r.runtime as AiRuntimeMode) ?? "direct_gemini",
      defaultModelId: String(r.default_model_id ?? geminiFallback.defaultModelId),
      failoverEnabled: r.failover_enabled !== false,
      gatewayApiKey: (r.gateway_api_key_secret as string) || null,
      openaiApiKey: (r.openai_api_key_secret as string) || null,
      anthropicApiKey: (r.anthropic_api_key_secret as string) || null,
      geminiApiKey: geminiFallback.geminiApiKey,
    };
  }

  const dbRows = await loadCatalogRows();
  const merged = await buildMergedCatalog({
    dbRows,
    includeDirectGemini: true,
    runtime: config.runtime,
  });
  catalog = merged.runtimeCatalog;

  let emergency = defaultEmergency();
  const { data: emergencyRow } = await supabase
    .from("ai_emergency_controls")
    .select("*")
    .eq("environment", environment)
    .maybeSingle();
  if (emergencyRow) {
    const e = emergencyRow as Record<string, unknown>;
    emergency = {
      stopAllCalls: Boolean(e.stop_all_calls),
      forceTemplateFallback: Boolean(e.force_template_fallback),
      disableStreaming: Boolean(e.disable_streaming),
      disableVision: Boolean(e.disable_vision),
      disableEmbeddings: Boolean(e.disable_embeddings),
    };
  }

  const value: ResolvedAiRuntime = { config, catalog, emergency };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function invalidateAiRuntimeCache(): void {
  cache.clear();
}
