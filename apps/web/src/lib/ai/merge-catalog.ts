/**
 * Merge live Vercel Gateway models with DB admin preferences (enabled, tier, eval).
 */
import {
  DEFAULT_MODEL_CATALOG,
  type ModelCatalogEntry,
  type ModelTier,
} from "@beautonomi/agent-model-router";
import type { AiRuntimeMode } from "@/lib/ai/resolve-runtime";
import {
  fetchLiveGatewayModels,
  liveModelToCatalogEntry,
  gatewayPricingPer1k,
  modelSupportsCaching,
  type LiveGatewayModel,
  type GatewayModelCapability,
} from "@/lib/ai/gateway-models";

export type DbCatalogRow = {
  id?: string;
  model_id: string;
  provider?: string;
  tier?: string;
  capability?: string;
  gateway?: boolean;
  enabled?: boolean;
  eval_passed_at?: string | null;
};

export type MergedLiveModel = LiveGatewayModel & {
  db_id: string | null;
  enabled: boolean;
  tier: ModelTier;
  gateway: true;
  eval_passed_at: string | null;
  input_usd_per_1k: number;
  output_usd_per_1k: number;
};

export type MergedCatalogResult = {
  runtimeCatalog: ModelCatalogEntry[];
  liveModels: MergedLiveModel[];
  directGeminiModels: ModelCatalogEntry[];
};

function dbRowMap(rows: DbCatalogRow[]): Map<string, DbCatalogRow> {
  return new Map(rows.map((r) => [r.model_id, r]));
}

function mergeLiveModels(
  live: LiveGatewayModel[],
  dbByModelId: Map<string, DbCatalogRow>,
  includeTypes: GatewayModelCapability[] = ["chat", "vision", "embedding"],
): MergedLiveModel[] {
  return live
    .filter((m) => includeTypes.includes(m.capability))
    .map((m) => {
      const db = dbByModelId.get(m.id);
      const tier = (db?.tier as ModelTier | undefined) ?? undefined;
      const pricing = gatewayPricingPer1k(m);
      return {
        ...m,
        db_id: db?.id ?? null,
        enabled: Boolean(db?.enabled),
        tier: tier ?? liveModelToCatalogEntry(m, false).tier,
        gateway: true as const,
        eval_passed_at: db?.eval_passed_at ?? null,
        input_usd_per_1k: pricing.inputUsdPer1k,
        output_usd_per_1k: pricing.outputUsdPer1k,
      };
    });
}

function directGeminiFromDb(
  dbByModelId: Map<string, DbCatalogRow>,
  catalogHasRows: boolean,
): ModelCatalogEntry[] {
  const direct = DEFAULT_MODEL_CATALOG.map((entry) => {
    const db = dbByModelId.get(entry.id);
    const enabled = db ? Boolean(db.enabled) : catalogHasRows ? false : entry.enabled;
    return {
      ...entry,
      enabled,
      tier: (db?.tier as ModelTier | undefined) ?? entry.tier,
    };
  });
  return direct;
}

/**
 * Build the runtime catalog: live Gateway models (with DB enable flags) + direct Gemini rows.
 */
export async function buildMergedCatalog(params: {
  dbRows: DbCatalogRow[];
  includeDirectGemini?: boolean;
  runtime?: AiRuntimeMode;
}): Promise<MergedCatalogResult> {
  const dbByModelId = dbRowMap(params.dbRows);
  let live: LiveGatewayModel[] = [];
  try {
    live = await fetchLiveGatewayModels();
  } catch {
    // Offline / Gateway unreachable: fall back to DB gateway rows only.
    live = params.dbRows
      .filter((r) => r.gateway && r.model_id.includes("/"))
      .map((r) => ({
        id: r.model_id,
        name: r.model_id,
        provider: r.provider ?? r.model_id.split("/")[0] ?? "unknown",
        ownedBy: r.provider ?? r.model_id.split("/")[0] ?? "unknown",
        type: r.capability === "embedding" ? "embedding" : "language",
        capability: (r.capability as GatewayModelCapability) ?? "chat",
        description: "",
        contextWindow: null,
        tags: [],
        inputUsdPerToken: 0,
        outputUsdPerToken: 0,
        released: null,
      }));
  }

  const liveModels = mergeLiveModels(live, dbByModelId);
  const runtimeLive: ModelCatalogEntry[] = liveModels.map((m) => {
    const entry = liveModelToCatalogEntry(m, m.enabled, m.tier);
    const capability =
      m.capability === "embedding" ? "embedding" : m.capability === "vision" ? "vision" : "chat";
    return {
      ...entry,
      capability,
      inputUsdPer1k: m.input_usd_per_1k,
      outputUsdPer1k: m.output_usd_per_1k,
      supportsCaching: modelSupportsCaching(m),
    };
  });
  const catalogHasRows = params.dbRows.length > 0;
  const directGeminiModels =
    params.includeDirectGemini !== false ? directGeminiFromDb(dbByModelId, catalogHasRows) : [];

  const runtimeCatalog = buildRuntimeCatalogOrder({
    runtime: params.runtime ?? "vercel_gateway",
    gatewayEntries: runtimeLive,
    directGeminiEntries: directGeminiModels,
  });
  return { runtimeCatalog, liveModels, directGeminiModels };
}

/** Gateway-first unless runtime is direct_gemini rollback. */
export function buildRuntimeCatalogOrder(params: {
  runtime: AiRuntimeMode;
  gatewayEntries: ModelCatalogEntry[];
  directGeminiEntries: ModelCatalogEntry[];
}): ModelCatalogEntry[] {
  if (params.runtime === "direct_gemini") {
    return [...params.directGeminiEntries, ...params.gatewayEntries];
  }
  return [...params.gatewayEntries, ...params.directGeminiEntries];
}

/** Models suitable for chat/template dropdowns (enabled + chat or vision). */
export function selectableChatModels(result: MergedCatalogResult): MergedLiveModel[] {
  return result.liveModels.filter(
    (m) => m.enabled && (m.capability === "chat" || m.capability === "vision"),
  );
}

export function selectableChatCatalogEntries(result: MergedCatalogResult): ModelCatalogEntry[] {
  const live = selectableChatModels(result).map((m) => liveModelToCatalogEntry(m, true, m.tier));
  const direct = result.directGeminiModels.filter((m) => m.enabled);
  return [...direct, ...live];
}

/** Prefer models tagged for implicit/explicit caching (large static system prompts). */
export function preferCachingCapableModels(models: MergedLiveModel[]): MergedLiveModel[] {
  const caching = models.filter(
    (m) => m.enabled && (m.tags.includes("implicit-caching") || m.tags.includes("explicit-caching")),
  );
  return caching.length ? caching : models;
}

/** Reorder runtime catalog so caching-capable models are tried first within routing. */
export function preferCachingCapableCatalog(catalog: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const caching = catalog.filter((c) => c.enabled && c.supportsCaching);
  if (!caching.length) return catalog;
  const cachingIds = new Set(caching.map((c) => c.id));
  const rest = catalog.filter((c) => !cachingIds.has(c.id));
  return [...caching, ...rest];
}
