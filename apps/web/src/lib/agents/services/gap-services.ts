import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AgentPrincipal } from "@beautonomi/agent-policy";
import { hashPayload } from "@beautonomi/agent-policy";
import { proposeAgentAction } from "../actions/action-service";

/** Agent investigates only — never sets maker_user_id or checker_user_id. */
export async function proposeReconciliationBriefing(
  principal: AgentPrincipal,
  exceptionId: string,
  briefing: { summary: string; suggestedResolution: string },
) {
  const supabase = getSupabaseAdmin();
  const { data: ex } = await supabase
    .from("reconciliation_exceptions")
    .select("id, tenant_id, status, mismatch_reason")
    .eq("id", exceptionId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (!ex) throw new Error("exception_not_found");

  return proposeAgentAction({
    tenantId: principal.tenantId,
    agentId: (await supabase.from("agent_definitions").select("id").eq("key", "reconciliation-investigator").single()).data!.id,
    workflowRunId: principal.workflowRunId,
    actionType: "reconciliation.investigate",
    targetType: "reconciliation_exception",
    targetId: exceptionId,
    proposedPayload: {
      exceptionId,
      status: ex.status,
      mismatchReason: ex.mismatch_reason,
      briefing,
      note: "Agent proposal only — human maker/checker required for resolution",
    },
    reasoningSummary: briefing.summary,
    riskLevel: 2,
    policyVersion: principal.agentDefinitionVersion,
    idempotencyKey: `recon-briefing:${exceptionId}:${hashPayload(briefing).slice(0, 16)}`,
  });
}

export async function listFraudCases(principal: AgentPrincipal, limit = 50) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fraud_cases")
    .select("id, status, risk_score, created_at, tenant_id")
    .eq("tenant_id", principal.tenantId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw error;
  return data ?? [];
}

export async function proposeFraudBriefing(
  principal: AgentPrincipal,
  caseId: string,
  briefing: { summary: string; recommendation: string },
) {
  const supabase = getSupabaseAdmin();
  const agent = await supabase.from("agent_definitions").select("id").eq("key", "trust-monitor").maybeSingle();
  if (!agent.data) throw new Error("trust-monitor agent not configured");
  return proposeAgentAction({
    tenantId: principal.tenantId,
    agentId: agent.data.id,
    workflowRunId: principal.workflowRunId,
    actionType: "fraud.briefing",
    targetType: "fraud_case",
    targetId: caseId,
    proposedPayload: { caseId, briefing, agentCannotDispose: true },
    reasoningSummary: briefing.summary,
    riskLevel: 3,
    policyVersion: principal.agentDefinitionVersion,
    idempotencyKey: `fraud-briefing:${caseId}:${hashPayload(briefing).slice(0, 16)}`,
  });
}

export async function listReconciliationExceptions(principal: AgentPrincipal, limit = 50) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reconciliation_exceptions")
    .select("id, status, currency, psp, mismatch_reason, created_at, maker_user_id, checker_user_id")
    .eq("tenant_id", principal.tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    agentRole: "investigator_only",
  }));
}

/** Human maker/checker resolution — agent cannot call this. */
export async function resolveReconciliationException(params: {
  exceptionId: string;
  tenantId: string;
  makerUserId: string;
  checkerUserId: string;
  resolution: "matched" | "written_off" | "escalated";
  makerUserIdMustDifferFromChecker: boolean;
}) {
  if (params.makerUserId === params.checkerUserId && params.makerUserIdMustDifferFromChecker) {
    throw new Error("maker_checker_must_differ");
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reconciliation_exceptions")
    .update({
      status: params.resolution,
      maker_user_id: params.makerUserId,
      checker_user_id: params.checkerUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.exceptionId)
    .eq("tenant_id", params.tenantId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Agent briefs a booking dispute — human resolves (refund/deny) via the admin disputes UI. */
export async function proposeDisputeBriefing(
  principal: AgentPrincipal,
  disputeId: string,
  briefing: { summary: string; suggestedNextStep: string },
) {
  const supabase = getSupabaseAdmin();
  const agent = await supabase.from("agent_definitions").select("id").eq("key", "trust-monitor").maybeSingle();
  if (!agent.data) throw new Error("trust-monitor agent not configured");
  return proposeAgentAction({
    tenantId: principal.tenantId,
    agentId: agent.data.id,
    workflowRunId: principal.workflowRunId,
    actionType: "dispute.briefing",
    targetType: "booking_dispute",
    targetId: disputeId,
    proposedPayload: { disputeId, briefing, agentCannotResolve: true },
    reasoningSummary: briefing.summary,
    riskLevel: 2,
    policyVersion: principal.agentDefinitionVersion,
    idempotencyKey: `dispute-briefing:${disputeId}:${hashPayload(briefing).slice(0, 16)}`,
  });
}

/** Agent briefs a user report (customer/provider flag) — human resolves or dismisses. */
export async function proposeReportBriefing(
  principal: AgentPrincipal,
  reportId: string,
  briefing: { summary: string; suggestedNextStep: string },
) {
  const supabase = getSupabaseAdmin();
  const agent = await supabase.from("agent_definitions").select("id").eq("key", "trust-monitor").maybeSingle();
  if (!agent.data) throw new Error("trust-monitor agent not configured");
  return proposeAgentAction({
    tenantId: principal.tenantId,
    agentId: agent.data.id,
    workflowRunId: principal.workflowRunId,
    actionType: "report.briefing",
    targetType: "user_report",
    targetId: reportId,
    proposedPayload: { reportId, briefing, agentCannotResolve: true },
    reasoningSummary: briefing.summary,
    riskLevel: 2,
    policyVersion: principal.agentDefinitionVersion,
    idempotencyKey: `report-briefing:${reportId}:${hashPayload(briefing).slice(0, 16)}`,
  });
}

export async function proposePayoutDecision(
  principal: AgentPrincipal,
  payoutId: string,
  decision: { recommendation: "approve" | "reject" | "hold"; rationale: string; amount: number },
) {
  const supabase = getSupabaseAdmin();
  const agent = await supabase.from("agent_definitions").select("id").eq("key", "payout-review").maybeSingle();
  return proposeAgentAction({
    tenantId: principal.tenantId,
    agentId: agent.data!.id,
    workflowRunId: principal.workflowRunId,
    actionType: "payout.review",
    targetType: "payout",
    targetId: payoutId,
    proposedPayload: {
      payoutId,
      recommendation: decision.recommendation,
      rationale: decision.rationale,
      approvedAmount: decision.amount,
    },
    reasoningSummary: decision.rationale,
    riskLevel: 2,
    policyVersion: principal.agentDefinitionVersion,
    toolName: "finance.proposePayoutDecision",
    toolVersion: "1",
    idempotencyKey: `payout-review:${payoutId}:${decision.recommendation}`,
  });
}
