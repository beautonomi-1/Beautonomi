import { describe, expect, it } from "vitest";
import { agentConsoleDeepLink } from "../agentConsoleDeepLink";

describe("agentConsoleDeepLink", () => {
  it("builds proposals deep link with default status", () => {
    const url = agentConsoleDeepLink({ agentId: "abc-123", panel: "proposals" });
    expect(url).toContain("/control-plane/modules/agents?");
    expect(url).toContain("agent_id=abc-123");
    expect(url).toContain("panel=proposals");
    expect(url).toContain("status=proposed");
  });

  it("builds runs deep link without status", () => {
    const url = agentConsoleDeepLink({ agentId: "abc-123", panel: "runs" });
    expect(url).toContain("agent_id=abc-123");
    expect(url).toContain("panel=runs");
    expect(url).not.toContain("status=");
  });
});
