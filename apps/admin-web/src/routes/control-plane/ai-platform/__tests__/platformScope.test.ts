import { describe, expect, it } from "vitest";
import { AI_PLATFORM_SCOPE, aiPlatformQuery, withAiPlatformScope } from "../platformScope";

describe("platformScope", () => {
  it("uses global scope on AI platform API calls", () => {
    expect(AI_PLATFORM_SCOPE).toBe("global");
    expect(aiPlatformQuery("production")).toContain("scope=global");
    expect(withAiPlatformScope({ environment: "production", preset: "gateway_cheap_global" })).toEqual({
      environment: "production",
      preset: "gateway_cheap_global",
      scope: "global",
    });
  });
});
