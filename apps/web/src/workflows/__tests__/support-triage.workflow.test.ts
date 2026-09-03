import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRegisterRun = vi.fn();
const mockFinishRun = vi.fn();
const mockTriageGate = vi.fn();
const mockClassifyAndPropose = vi.fn();
const mockExecuteApproved = vi.fn();
const mockReadActionStatus = vi.fn();
const mockRecordOutcome = vi.fn();
const mockCreateHook = vi.fn();
const mockSleep = vi.fn();

vi.mock("../steps/run-registry", () => ({
  registerRun: (...args: unknown[]) => mockRegisterRun(...args),
  finishRun: (...args: unknown[]) => mockFinishRun(...args),
}));

vi.mock("../steps/support-triage", () => ({
  triageGate: (...args: unknown[]) => mockTriageGate(...args),
  classifyAndPropose: (...args: unknown[]) => mockClassifyAndPropose(...args),
  executeApproved: (...args: unknown[]) => mockExecuteApproved(...args),
  readActionStatus: (...args: unknown[]) => mockReadActionStatus(...args),
  recordOutcome: (...args: unknown[]) => mockRecordOutcome(...args),
}));

vi.mock("workflow", () => ({
  createHook: (...args: unknown[]) => mockCreateHook(...args),
  sleep: (...args: unknown[]) => mockSleep(...args),
  getWorkflowMetadata: () => ({ workflowRunId: "wrun_test" }),
}));

const never = () => new Promise<never>(() => {});

/** Thenable + disposable stand-in for the SDK Hook object. */
function hookResolving(value: { decision: "approve" | "reject" }) {
  return {
    then(onFulfilled: (v: typeof value) => unknown) {
      return Promise.resolve(value).then(onFulfilled);
    },
    [Symbol.dispose]: () => {},
  };
}

function hookPending() {
  return { then: () => never(), [Symbol.dispose]: () => {} };
}

const openGate = {
  allowed: true,
  ticketId: "ticket-1",
  tenantId: "tenant-1",
  agentId: "agent-1",
  agentVersion: "v1",
  shadowMode: false,
};

describe("supportTriageWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterRun.mockResolvedValue({ id: 1, runId: "wrun_test" });
    mockFinishRun.mockResolvedValue(undefined);
    mockExecuteApproved.mockResolvedValue(undefined);
    mockRecordOutcome.mockResolvedValue(undefined);
    mockReadActionStatus.mockResolvedValue("proposed");
    mockSleep.mockImplementation(never);
  });

  it("registers the run with the SDK run id and finishes without proposals when gate denies", async () => {
    mockTriageGate.mockResolvedValue({ allowed: false, reason: "agent_not_active" });

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockRegisterRun).toHaveBeenCalledWith("wrun_test", "support-triage", "support_ticket", "ticket-1");
    expect(mockFinishRun).toHaveBeenCalledWith(1, "completed", "agent_not_active");
    expect(mockClassifyAndPropose).not.toHaveBeenCalled();
    expect(mockCreateHook).not.toHaveBeenCalled();
  });

  it("passes the SDK run id to the propose step and executes approved proposals", async () => {
    mockTriageGate.mockResolvedValue(openGate);
    mockClassifyAndPropose.mockResolvedValue([
      { type: "support.reply", actionId: "action-1", approvalExpiresAt: "2026-09-09T00:00:00.000Z" },
    ]);
    mockCreateHook.mockReturnValue(hookResolving({ decision: "approve" }));

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockClassifyAndPropose).toHaveBeenCalledWith("ticket-1", "wrun_test", openGate);
    expect(mockCreateHook).toHaveBeenCalledWith({ token: "agent-approval:action-1" });
    expect(mockSleep).toHaveBeenCalledWith(new Date("2026-09-09T00:00:00.000Z"));
    expect(mockExecuteApproved).toHaveBeenCalledWith("action-1");
    expect(mockRecordOutcome).not.toHaveBeenCalled();
    expect(mockFinishRun).toHaveBeenLastCalledWith(1, "completed");
  });

  it("registers all hooks before awaiting so proposals can be decided in any order", async () => {
    mockTriageGate.mockResolvedValue(openGate);
    mockClassifyAndPropose.mockResolvedValue([
      { type: "support.reply", actionId: "reply-1", approvalExpiresAt: null },
      { type: "support.assign", actionId: "assign-1", approvalExpiresAt: null },
    ]);
    // First hook never resolves on its own; second resolves immediately.
    let hookCalls = 0;
    mockCreateHook.mockImplementation(() =>
      ++hookCalls === 1 ? hookResolving({ decision: "reject" }) : hookResolving({ decision: "approve" }),
    );

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockCreateHook).toHaveBeenCalledTimes(2);
    expect(mockCreateHook.mock.calls.map((c) => c[0].token)).toEqual([
      "agent-approval:reply-1",
      "agent-approval:assign-1",
    ]);
    expect(mockSleep).toHaveBeenCalledWith("7d");
    expect(mockRecordOutcome).toHaveBeenCalledWith("reply-1", "reject");
    expect(mockExecuteApproved).toHaveBeenCalledWith("assign-1");
  });

  it("records reject outcome", async () => {
    mockTriageGate.mockResolvedValue(openGate);
    mockClassifyAndPropose.mockResolvedValue([{ type: "support.reply", actionId: "action-2", approvalExpiresAt: null }]);
    mockCreateHook.mockReturnValue(hookResolving({ decision: "reject" }));

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockRecordOutcome).toHaveBeenCalledWith("action-2", "reject");
    expect(mockExecuteApproved).not.toHaveBeenCalled();
  });

  it("on timeout expires the proposal when still undecided", async () => {
    mockTriageGate.mockResolvedValue(openGate);
    mockClassifyAndPropose.mockResolvedValue([{ type: "support.assign", actionId: "action-3", approvalExpiresAt: null }]);
    mockCreateHook.mockReturnValue(hookPending());
    mockSleep.mockResolvedValue(undefined);
    mockReadActionStatus.mockResolvedValue("approval_pending");

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockReadActionStatus).toHaveBeenCalledWith("action-3");
    expect(mockRecordOutcome).toHaveBeenCalledWith("action-3", "timeout");
    expect(mockExecuteApproved).not.toHaveBeenCalled();
  });

  it("on timeout executes if the row was approved while the hook was unregistered", async () => {
    mockTriageGate.mockResolvedValue(openGate);
    mockClassifyAndPropose.mockResolvedValue([{ type: "support.assign", actionId: "action-4", approvalExpiresAt: null }]);
    mockCreateHook.mockReturnValue(hookPending());
    mockSleep.mockResolvedValue(undefined);
    mockReadActionStatus.mockResolvedValue("approved");

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await supportTriageWorkflow("ticket-1");

    expect(mockExecuteApproved).toHaveBeenCalledWith("action-4");
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it("marks the registry row failed and rethrows when a step throws", async () => {
    mockTriageGate.mockRejectedValue(new Error("supabase down"));

    const { supportTriageWorkflow } = await import("../agents/support-triage.workflow");
    await expect(supportTriageWorkflow("ticket-1")).rejects.toThrow("supabase down");

    expect(mockFinishRun).toHaveBeenCalledWith(1, "failed", "supabase down");
  });
});
