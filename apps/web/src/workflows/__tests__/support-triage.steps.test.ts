import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadModule = vi.fn();
const mockLoadEmergency = vi.fn();
const mockLoadDefinition = vi.fn();
const mockLoadOpState = vi.fn();
const mockResolveTenant = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/agents/config-loader", () => ({
  loadAgentModuleConfig: (...args: unknown[]) => mockLoadModule(...args),
  loadAgentEmergencyControls: (...args: unknown[]) => mockLoadEmergency(...args),
  loadAgentDefinition: (...args: unknown[]) => mockLoadDefinition(...args),
  loadAgentOperationalState: (...args: unknown[]) => mockLoadOpState(...args),
}));

vi.mock("@/lib/agents/support-ticket-tenant", () => ({
  resolveSupportTicketTenantId: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/agents/actions/action-service", () => ({
  acquireExecutionLease: vi.fn(),
  completeExecution: vi.fn(),
}));
vi.mock("@/lib/agents/actions/execute-approved-agent-action", () => ({
  executeApprovedAgentAction: vi.fn(),
}));
vi.mock("@/lib/agents/workflows/support-agent", () => ({
  classifyAndProposeForTicket: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
      }),
    }),
  }),
}));

describe("triageGate step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModule.mockResolvedValue({ masterEnabled: true, shadowMode: false });
    mockLoadEmergency.mockResolvedValue({ stopNewRuns: false });
    mockLoadDefinition.mockResolvedValue({ id: "agent-1", active_version: "v1" });
    mockLoadOpState.mockResolvedValue({ state: "active" });
    mockResolveTenant.mockResolvedValue("tenant-1");
    mockMaybeSingle.mockResolvedValue({ data: { id: "t1", status: "open", provider_id: null } });
  });

  it("throws FatalError when the emergency kill switch stops new runs", async () => {
    mockLoadEmergency.mockResolvedValue({ stopNewRuns: true });
    const { FatalError } = await import("workflow");
    const { triageGate } = await import("../steps/support-triage");

    await expect(triageGate("t1")).rejects.toBeInstanceOf(FatalError);
    await expect(triageGate("t1")).rejects.toThrow("emergency_stop_new_runs");
    expect(mockLoadDefinition).not.toHaveBeenCalled();
  });

  it("throws FatalError when the agent module master switch is off", async () => {
    mockLoadModule.mockResolvedValue({ masterEnabled: false, shadowMode: false });
    const { FatalError } = await import("workflow");
    const { triageGate } = await import("../steps/support-triage");

    await expect(triageGate("t1")).rejects.toBeInstanceOf(FatalError);
  });

  it("returns allowed:false (no retry, no throw) when the agent is not active", async () => {
    mockLoadOpState.mockResolvedValue({ state: "paused" });
    const { triageGate } = await import("../steps/support-triage");

    await expect(triageGate("t1")).resolves.toEqual({ allowed: false, reason: "agent_not_active" });
  });

  it("returns allowed:false for closed tickets", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "t1", status: "closed", provider_id: null } });
    const { triageGate } = await import("../steps/support-triage");

    await expect(triageGate("t1")).resolves.toEqual({ allowed: false, reason: "ticket_status_closed" });
  });

  it("returns the gate context when everything is open", async () => {
    const { triageGate } = await import("../steps/support-triage");

    await expect(triageGate("t1")).resolves.toEqual({
      allowed: true,
      ticketId: "t1",
      tenantId: "tenant-1",
      agentId: "agent-1",
      agentVersion: "v1",
      shadowMode: false,
    });
  });
});
