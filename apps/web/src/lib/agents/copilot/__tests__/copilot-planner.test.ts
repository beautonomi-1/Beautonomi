import { describe, expect, it } from "vitest";
import { sanitizeTurnPlan, shouldInvokePlanner } from "../copilot-planner";

describe("copilot-planner", () => {
  it("filters tool calls to allowed sections", () => {
    const plan = sanitizeTurnPlan(
      {
        turn_kind: "data_question",
        tool_calls: [
          { name: "finance.readProviderSummary", input: { providerId: "11111111-1111-4111-8111-111111111111" } },
          { name: "trust.readFraudCase", input: { caseId: "22222222-2222-4222-8222-222222222222" } },
        ],
      },
      ["finance"],
    );
    expect(plan?.tool_calls?.length).toBe(1);
    expect(plan?.tool_calls?.[0]?.name).toBe("finance.readProviderSummary");
  });

  it("invokes planner for unknown intent without primary", () => {
    expect(
      shouldInvokePlanner({ intent: "unknown", hasPrimary: false, resolverStatus: "ready" }),
    ).toBe(true);
    expect(
      shouldInvokePlanner({ intent: "provider.health", hasPrimary: true, resolverStatus: "ready" }),
    ).toBe(false);
  });
});
