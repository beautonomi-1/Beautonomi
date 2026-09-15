import type { DirectGeminiModel, LiveModelRow, SelectableModel } from "./types";

/** Chat/vision models for the Gateway default-model picker (full live catalog, not enabled-only). */
export function buildDefaultModelPickerOptions(params: {
  runtime: string;
  liveModels: LiveModelRow[];
  directGeminiModels: DirectGeminiModel[];
  selectableModels: SelectableModel[];
}): SelectableModel[] {
  if (params.runtime === "direct_gemini") {
    return params.directGeminiModels.map((m) => ({
      model_id: m.id,
      provider: m.provider,
      tier: m.tier,
      gateway: m.gateway,
      catalog_enabled: m.enabled,
    }));
  }

  const gatewayChat = params.liveModels
    .filter((m) => m.capability === "chat" || m.capability === "vision")
    .map((m) => ({
      model_id: m.id,
      provider: m.provider,
      tier: m.tier,
      gateway: true,
      catalog_enabled: m.enabled,
    }));

  if (gatewayChat.length > 0) return gatewayChat;

  return params.selectableModels.map((m) => ({ ...m, catalog_enabled: true }));
}

export function countEnabledLiveModels(liveModels: LiveModelRow[]): number {
  return liveModels.filter((m) => m.enabled).length;
}
