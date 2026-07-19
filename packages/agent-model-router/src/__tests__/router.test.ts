import { describe, it, expect } from "vitest";
import {
  routeModel,
  catalogEntryFromGatewayId,
  DEFAULT_MODEL_CATALOG,
  GEMINI_MODELS,
  type ModelCatalogEntry,
} from "../router";

const baseReq = {
  task: "classification" as const,
  riskTier: 0,
  contextTokens: 500,
  escalationSignals: [],
  escalationCount: 0,
  maxEscalations: 2,
  maxCostUsd: 0.1,
  spentUsd: 0,
};

describe("model router", () => {
  it("defaults to the Gemini catalog", () => {
    const r = routeModel(baseReq);
    expect(r.provider).toBe("gemini");
    expect(r.modelId).toBe(GEMINI_MODELS.flashLite);
    expect(r.gateway).toBe(false);
  });

  it("routes risk >= 3 with complex signal to pro tier", () => {
    const r = routeModel({ ...baseReq, riskTier: 3, escalationSignals: ["high_risk_action"] });
    expect(r.tier).toBe("pro");
    expect(r.modelId).toBe(GEMINI_MODELS.pro);
  });

  it("supports Vercel AI Gateway model IDs via custom catalog", () => {
    const catalog: ModelCatalogEntry[] = [
      catalogEntryFromGatewayId("openai/gpt-5-mini", "lite"),
      catalogEntryFromGatewayId("anthropic/claude-sonnet-4.5", "flash"),
      catalogEntryFromGatewayId("openai/gpt-5", "pro"),
    ];
    const lite = routeModel({ ...baseReq, catalog });
    expect(lite).toMatchObject({ provider: "openai", modelId: "openai/gpt-5-mini", gateway: true });

    const pro = routeModel({ ...baseReq, catalog, riskTier: 3 });
    expect(pro).toMatchObject({ provider: "openai", modelId: "openai/gpt-5", tier: "pro", gateway: true });
  });

  it("degrades to a lower tier when the requested tier is disabled, never upgrades", () => {
    const catalog: ModelCatalogEntry[] = [
      { ...DEFAULT_MODEL_CATALOG[0], enabled: true },
      { ...DEFAULT_MODEL_CATALOG[1], enabled: true },
      { ...DEFAULT_MODEL_CATALOG[2], enabled: false },
    ];
    const r = routeModel({ ...baseReq, catalog, riskTier: 3 });
    expect(r.tier).toBe("flash");
  });

  it("stops on cost cap with the cheapest model", () => {
    const r = routeModel({ ...baseReq, spentUsd: 0.2 });
    expect(r.shouldStop).toBe(true);
    expect(r.stopReason).toBe("cost_cap");
    expect(r.tier).toBe("lite");
  });
});
