import { proposePayoutDecision } from "../services/gap-services";
import { buildAgentPrincipal } from "../principal";
import { loadAgentDefinition, loadAgentModuleConfig } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { readPayoutSummary } from "../tools/implementations";

/** Human-approved payout recommendation workflow — propose only, never execute. */
export async function runPayoutReviewWorkflow(params: {
  tenantId: string;
  payoutId: string;
  recommendation: "approve" | "reject" | "hold";
  rationale: string;
}) {
  const module = await loadAgentModuleConfig();
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason };

  const def = await loadAgentDefinition("payout-review");
  if (!def) throw new Error("payout-review not configured");

  const principal = buildAgentPrincipal({
    actorId: def.id,
    agentKey: "payout-review",
    agentDefinitionVersion: def.active_version,
    tenantId: params.tenantId,
    role: def.admin_role,
    workflowType: "payout-review",
    workflowRunId: `payout-${params.payoutId}`,
  });

  const payout = await readPayoutSummary(principal, params.payoutId);
  const action = await proposePayoutDecision(principal, params.payoutId, {
    recommendation: params.recommendation,
    rationale: params.rationale,
    amount: payout.amount,
  });

  return {
    actionId: action.id,
    shadowMode: module.shadowMode,
    requiresMakerChecker: true,
    note: "Execution requires human approval via Agent Inbox + deterministic posting service",
  };
}
