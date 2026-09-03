"use workflow";

import { createHook, getWorkflowMetadata, sleep } from "workflow";
import { registerRun, finishRun } from "../steps/run-registry";
import {
  triageGate,
  classifyAndPropose,
  executeApproved,
  readActionStatus,
  recordOutcome,
  type WorkflowProposal,
} from "../steps/support-triage";

type ApprovalDecision = { decision: "approve" | "reject" };

/**
 * Durable support triage: gate -> classify + propose -> wait for a human
 * decision per proposal (hook) or the approval window elapsing (sleep) ->
 * execute or record the outcome. Orchestrator does no I/O; all side effects
 * live in `steps/`.
 */
export async function supportTriageWorkflow(ticketId: string) {
  const { workflowRunId } = getWorkflowMetadata();
  const run = await registerRun(workflowRunId, "support-triage", "support_ticket", ticketId);

  try {
    const gate = await triageGate(ticketId);
    if (gate.allowed === false) {
      await finishRun(run.id, "completed", gate.reason);
      return;
    }

    const proposals = await classifyAndPropose(ticketId, workflowRunId, gate);

    // All hooks are registered at the same suspension point so a reviewer can
    // decide the proposals in any order.
    await Promise.all(proposals.map((proposal) => awaitDecision(proposal)));

    await finishRun(run.id, "completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, "failed", message.slice(0, 500));
    throw err;
  }
}

async function awaitDecision(proposal: WorkflowProposal): Promise<void> {
  using hook = createHook<ApprovalDecision>({
    token: `agent-approval:${proposal.actionId}`,
  });

  // Wait until the proposal's approval window closes (falls back to 7 days).
  const timeout = proposal.approvalExpiresAt
    ? sleep(new Date(proposal.approvalExpiresAt))
    : sleep("7d");
  const result = await Promise.race([
    hook,
    timeout.then(() => ({ decision: "timeout" as const })),
  ]);

  if (result.decision === "approve") {
    await executeApproved(proposal.actionId);
    return;
  }

  if (result.decision === "reject") {
    await recordOutcome(proposal.actionId, "reject");
    return;
  }

  // Timeout: a decision may have landed while the hook was not yet
  // registered (race with the propose step). Trust the row, not the hook.
  const status = await readActionStatus(proposal.actionId);
  if (status === "approved") {
    await executeApproved(proposal.actionId);
  } else {
    await recordOutcome(proposal.actionId, "timeout");
  }
}
