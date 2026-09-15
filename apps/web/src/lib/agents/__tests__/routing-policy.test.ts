import { describe, it, expect } from "vitest";
import { catalogEntryFromGatewayId } from "@beautonomi/agent-model-router";
import {
  applyRoutingPolicy,
  parseRoutingPolicy,
  resolveTaskModelOverride,
  resolveTaskTierOverride,
} from "../routing-policy";

describe("routing policy", () => {
  it("parses JSON policy and ignores invalid payloads", () => {
    expect(parseRoutingPolicy('{"defaultTier":"lite"}')).toEqual({ defaultTier: "lite" });
    expect(parseRoutingPolicy("not-json")).toBeNull();
    expect(parseRoutingPolicy(null)).toBeNull();
  });

  it("applies defaultTier to enabled catalog entries", () => {
    const catalog = [
      catalogEntryFromGatewayId("openai/gpt-5-mini", "flash", true),
      catalogEntryFromGatewayId("openai/gpt-5", "pro", false),
    ];
    const next = applyRoutingPolicy(catalog, { defaultTier: "lite" });
    expect(next[0]?.tier).toBe("lite");
    expect(next[1]?.tier).toBe("pro");
  });

  it("resolves task model and tier overrides when enabled", () => {
    const catalog = [catalogEntryFromGatewayId("openai/gpt-5-mini", "lite", true)];
    const policy = {
      taskModel: { classification: "openai/gpt-5-mini" as const },
      taskTier: { copilot: "flash" as const },
    };
    expect(resolveTaskModelOverride(policy, "classification", catalog)).toBe("openai/gpt-5-mini");
    expect(resolveTaskTierOverride(policy, "copilot")).toBe("flash");
  });
});
