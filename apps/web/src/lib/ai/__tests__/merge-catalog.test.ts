import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMergedCatalog, selectableChatModels } from "../merge-catalog";

vi.mock("../gateway-models", () => ({
  fetchLiveGatewayModels: vi.fn(),
  liveModelToCatalogEntry: vi.fn((m: { id: string }, enabled: boolean, tier?: string) => ({
    id: m.id,
    provider: m.id.split("/")[0],
    tier: tier ?? "flash",
    gateway: true,
    enabled,
  })),
  gatewayPricingPer1k: vi.fn(() => ({ inputUsdPer1k: 0.0001, outputUsdPer1k: 0.0004 })),
  inferGatewayTier: vi.fn(() => "flash" as const),
  modelSupportsCaching: vi.fn(() => false),
}));

describe("buildMergedCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges live Gateway models with DB enabled flags", async () => {
    const { fetchLiveGatewayModels } = await import("../gateway-models");
    (fetchLiveGatewayModels as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "openai/gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        provider: "openai",
        ownedBy: "openai",
        type: "language",
        capability: "chat",
        description: "",
        contextWindow: 128000,
        tags: [],
        inputUsdPerToken: 0.0000004,
        outputUsdPerToken: 0.0000016,
        released: 1,
      },
    ]);

    const result = await buildMergedCatalog({
      dbRows: [{ model_id: "openai/gpt-4.1-mini", enabled: true, gateway: true }],
    });

    expect(result.liveModels).toHaveLength(1);
    expect(result.liveModels[0].enabled).toBe(true);
    expect(selectableChatModels(result)).toHaveLength(1);
    expect(result.runtimeCatalog.some((c) => c.id === "openai/gpt-4.1-mini" && c.enabled)).toBe(true);
  });

  it("defaults new live models to disabled when no DB row exists", async () => {
    const { fetchLiveGatewayModels } = await import("../gateway-models");
    (fetchLiveGatewayModels as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        provider: "anthropic",
        ownedBy: "anthropic",
        type: "language",
        capability: "chat",
        description: "",
        contextWindow: 200000,
        tags: [],
        inputUsdPerToken: 0.000003,
        outputUsdPerToken: 0.000015,
        released: 2,
      },
    ]);

    const result = await buildMergedCatalog({ dbRows: [] });
    expect(result.liveModels[0].enabled).toBe(false);
  });
});
