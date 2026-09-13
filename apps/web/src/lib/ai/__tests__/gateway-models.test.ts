import { describe, it, expect } from "vitest";
import { inferGatewayTier, pickLatestGatewayModel, type LiveGatewayModel } from "../gateway-models";

describe("inferGatewayTier", () => {
  it("classifies mini/lite models as lite tier", () => {
    expect(inferGatewayTier(0.0000004, "openai/gpt-4.1-mini")).toBe("lite");
  });

  it("classifies sonnet/pro models as pro tier", () => {
    expect(inferGatewayTier(0.000003, "anthropic/claude-sonnet-4.6")).toBe("pro");
  });
});

describe("pickLatestGatewayModel", () => {
  const models: LiveGatewayModel[] = [
    {
      id: "google/gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash Lite",
      provider: "google",
      ownedBy: "google",
      type: "language",
      capability: "chat",
      description: "",
      contextWindow: 1000000,
      tags: [],
      inputUsdPerToken: 0.0000001,
      outputUsdPerToken: 0.0000004,
      released: 100,
    },
    {
      id: "google/gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
      provider: "google",
      ownedBy: "google",
      type: "language",
      capability: "chat",
      description: "",
      contextWindow: 1000000,
      tags: [],
      inputUsdPerToken: 0.000002,
      outputUsdPerToken: 0.000012,
      released: 200,
    },
  ];

  it("picks the newest model by released timestamp", () => {
    const picked = pickLatestGatewayModel(models, "google", (m) => m.capability === "chat");
    expect(picked?.id).toBe("google/gemini-3.1-pro-preview");
  });
});
