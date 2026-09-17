import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents/config-loader", () => ({
  loadAgentModuleConfig: vi.fn(async () => ({
    masterEnabled: true,
    environment: "development",
    shadowMode: false,
  })),
  loadAgentDefinition: vi.fn(async () => ({
    id: "def-copilot",
    active_version: "1.0.0",
    preferred_model_id: null,
    fallback_model_id: null,
    max_cost_usd_per_run: 0.1,
  })),
  loadAgentEmergencyControls: vi.fn(async () => ({
    stopNewRuns: false,
    stopAllToolCalls: false,
    blockApprovedExecution: false,
    freezePendingProposals: false,
    stopAllCalls: false,
    forceTemplateFallback: false,
  })),
  loadAgentOperationalState: vi.fn(async () => ({ state: "active" })),
  loadToolGrant: vi.fn(async () => ({
    toolName: "x",
    toolVersion: "1",
    riskCeiling: 3,
    maxRows: 10,
    maxOutputBytes: 8192,
    active: true,
  })),
}));

vi.mock("@/lib/ai/resolve-runtime", () => ({
  resolveAiRuntime: vi.fn(async () => ({ config: { enabled: true }, catalog: [] })),
}));

vi.mock("@/lib/agents/llm", () => ({
  callAgentLlm: vi.fn(async () => ({ configured: false })),
  parseLlmJson: vi.fn(),
}));

vi.mock("@/lib/admin/global-search", () => ({
  runAdminGlobalSearch: vi.fn(),
}));

vi.mock("@/lib/agents/copilot/canonicalize-entity", () => ({
  canonicalizeEntityRef: vi.fn(async (_t: string, _type: string, id: string) => ({ entityId: id })),
  canonicalizeProviderId: vi.fn(async (_t: string, id: string) => ({ id })),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}));

vi.mock("@beautonomi/agent-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@beautonomi/agent-tools")>();
  return {
    ...actual,
    executeTool: vi.fn(async () => ({ ok: false, error: "mock_skip" })),
  };
});

import { runAdminGlobalSearch } from "@/lib/admin/global-search";
import { runAdminCopilotOrchestrator } from "../copilot-orchestrator";

describe("runAdminCopilotOrchestrator help", () => {
  beforeEach(() => {
    vi.mocked(runAdminGlobalSearch).mockReset();
  });

  it("returns capability-style answer for meta question without search", async () => {
    const result = await runAdminCopilotOrchestrator({
      question: "what do you have access to",
      tenantId: "22222222-2222-4222-8222-222222222222",
      adminRole: "superadmin",
      adminUserId: "33333333-3333-4333-8333-333333333333",
      allowedSections: ["providers_operations", "overview", "finance"],
    });
    expect(runAdminGlobalSearch).not.toHaveBeenCalled();
    expect("error" in result ? result.error : null).toBeNull();
    expect(result.answer).toMatch(/copilot|provider|Beautonomi/i);
    expect(result.suggestedPrompts?.length).toBeGreaterThan(0);
  });
});
