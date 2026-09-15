import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadEmergency = vi.fn();
const mockInsert = vi.fn();
const mockSlack = vi.fn();
const mockNotifyAdminOps = vi.fn();

vi.mock("@/lib/agents/config-loader", () => ({
  loadAgentEmergencyControls: () => mockLoadEmergency(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({
          single: mockInsert,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/integrations/slack/agent-triggers", () => ({
  slackNotifyAgentActionProposed: (...args: unknown[]) => mockSlack(...args),
}));

vi.mock("@/lib/notifications/notify-admin-ops", () => ({
  notifyAdminOps: (...args: unknown[]) => mockNotifyAdminOps(...args),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(),
}));

vi.mock("@/workflows/config", () => ({
  isWorkflowFamilyEnabled: vi.fn(),
}));

import { proposeAgentAction } from "../action-service";

describe("proposeAgentAction freeze_pending_proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadEmergency.mockResolvedValue({
      stopNewRuns: false,
      stopAllToolCalls: false,
      blockApprovedExecution: false,
      freezePendingProposals: true,
    });
  });

  it("returns null and does not insert when proposals are frozen", async () => {
    const result = await proposeAgentAction({
      tenantId: "tenant-1",
      agentId: "agent-1",
      actionType: "support.reply",
      targetType: "support_ticket",
      targetId: "ticket-1",
      proposedPayload: { message: "hello" },
      riskLevel: 1,
      policyVersion: "v1",
      idempotencyKey: "idem-1",
    });

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSlack).not.toHaveBeenCalled();
    expect(mockNotifyAdminOps).not.toHaveBeenCalled();
  });
});
