/**
 * Live model catalog from Vercel AI Gateway (always up to date).
 * @see https://vercel.com/docs/ai-gateway/models-and-providers
 */
import { catalogEntryFromGatewayId, type ModelTier } from "@beautonomi/agent-model-router";

export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
export const GATEWAY_MODELS_CACHE_TTL_MS = 15 * 60 * 1000;

export type GatewayModelCapability = "chat" | "vision" | "embedding" | "other";

export type LiveGatewayModel = {
  id: string;
  name: string;
  provider: string;
  ownedBy: string;
  type: string;
  capability: GatewayModelCapability;
  description: string;
  contextWindow: number | null;
  tags: string[];
  /** USD per token (Gateway API). */
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  released: number | null;
};

type RawGatewayModel = {
  id: string;
  name?: string;
  owned_by?: string;
  type?: string;
  description?: string;
  context_window?: number;
  tags?: string[];
  pricing?: { input?: string; output?: string };
  released?: number;
};

let cache: { expiresAt: number; models: LiveGatewayModel[] } | null = null;
let inflight: Promise<LiveGatewayModel[]> | null = null;

function inferCapability(raw: RawGatewayModel): GatewayModelCapability {
  const type = raw.type ?? "language";
  const tags = raw.tags ?? [];
  if (type === "embedding") return "embedding";
  if (type === "language" && tags.includes("vision")) return "vision";
  if (type === "language") return "chat";
  return "other";
}

/** Heuristic tier from per-token input price (USD). */
export function inferGatewayTier(inputUsdPerToken: number, modelId: string): ModelTier {
  const id = modelId.toLowerCase();
  if (/lite|mini|nano|flash-lite|3\.5|haiku|small/.test(id)) return "lite";
  if (/pro|opus|sonnet|gpt-5|gpt-4(?!\.1-mini)|o1|o3|reasoning/.test(id)) return "pro";
  const per1k = inputUsdPerToken * 1000;
  if (per1k < 0.0002) return "lite";
  if (per1k < 0.002) return "flash";
  return "pro";
}

function normalizeRawModel(raw: RawGatewayModel): LiveGatewayModel | null {
  if (!raw.id || !raw.id.includes("/")) return null;
  const inputUsdPerToken = Number(raw.pricing?.input ?? 0);
  const outputUsdPerToken = Number(raw.pricing?.output ?? 0);
  const ownedBy = raw.owned_by ?? raw.id.split("/")[0] ?? "unknown";
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    provider: ownedBy,
    ownedBy,
    type: raw.type ?? "language",
    capability: inferCapability(raw),
    description: raw.description ?? "",
    contextWindow: raw.context_window ?? null,
    tags: raw.tags ?? [],
    inputUsdPerToken,
    outputUsdPerToken,
    released: raw.released ?? null,
  };
}

export function invalidateGatewayModelsCache(): void {
  cache = null;
  inflight = null;
}

/** Fetch the full Gateway model list (public endpoint, no auth). Cached 15 minutes. */
export async function fetchLiveGatewayModels(options?: { force?: boolean }): Promise<LiveGatewayModel[]> {
  if (!options?.force && cache && cache.expiresAt > Date.now()) {
    return cache.models;
  }
  if (!options?.force && inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(GATEWAY_MODELS_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      throw new Error(`gateway_models_fetch_failed:${res.status}`);
    }
    const json = (await res.json()) as { data?: RawGatewayModel[] };
    const models = (json.data ?? [])
      .map(normalizeRawModel)
      .filter((m): m is LiveGatewayModel => m != null)
      .sort((a, b) => {
        const prov = a.provider.localeCompare(b.provider);
        if (prov !== 0) return prov;
        return (b.released ?? 0) - (a.released ?? 0);
      });
    cache = { expiresAt: Date.now() + GATEWAY_MODELS_CACHE_TTL_MS, models };
    inflight = null;
    return models;
  })();

  try {
    return await inflight;
  } catch (err) {
    inflight = null;
    if (cache) return cache.models;
    throw err;
  }
}

export function liveModelToCatalogEntry(
  model: LiveGatewayModel,
  enabled: boolean,
  tierOverride?: ModelTier,
): ReturnType<typeof catalogEntryFromGatewayId> {
  const tier = tierOverride ?? inferGatewayTier(model.inputUsdPerToken, model.id);
  return catalogEntryFromGatewayId(model.id, tier, enabled);
}

export function gatewayPricingPer1k(model: LiveGatewayModel): { inputUsdPer1k: number; outputUsdPer1k: number } {
  return {
    inputUsdPer1k: model.inputUsdPerToken * 1000,
    outputUsdPer1k: model.outputUsdPerToken * 1000,
  };
}

/** Pick the newest model matching a provider prefix and optional filter (for presets). */
export function pickLatestGatewayModel(
  models: LiveGatewayModel[],
  providerPrefix: string,
  filter?: (m: LiveGatewayModel) => boolean,
): LiveGatewayModel | null {
  const matches = models.filter(
    (m) =>
      m.id.startsWith(`${providerPrefix}/`) &&
      m.capability !== "other" &&
      (filter ? filter(m) : true),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => (b.released ?? 0) - (a.released ?? 0))[0] ?? null;
}
