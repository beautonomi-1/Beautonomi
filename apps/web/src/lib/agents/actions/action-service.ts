import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashPayload,
  validateExecutionApproval,
  canAcquireExecutionLease,
  type AgentActionStatus,
} from "@beautonomi/agent-policy";
import { loadAgentEmergencyControls } from "../config-loader";
import { slackNotifyAgentActionProposed } from "@/lib/integrations/slack/agent-triggers";
import { isWorkflowFamilyEnabled } from "@/workflows/config";
import { trackServer } from "@/lib/analytics/amplitude/server";

// Event name constants live in the analytics taxonomy package (packages/analytics/src/events.ts);
// string literals here avoid a cross-package edit. Fire-and-forget: analytics never blocks agents.
const AMPLITUDE_AGENT_ACTION_PROPOSED = "agent_action_proposed";
const AMPLITUDE_AGENT_ACTION_EXECUTED = "agent_action_executed";

function emitAgentEvent(eventName: string, properties: Record<string, unknown>, insertId?: string): void {
  void trackServer(eventName, properties, undefined, insertId ? { insertId } : undefined).catch(() => undefined);
}

export type ProposeActionInput = {
  tenantId: string;
  agentId: string;
  workflowRunId?: string;
  actionType: string;
  targetType: string;
  targetId: string;
  proposedPayload: Record<string, unknown>;
  reasoningSummary?: string;
  riskLevel: number;
  policyVersion: string;
  toolName?: string;
  toolVersion?: string;
  promptVersion?: string;
  idempotencyKey: string;
  correlationId?: string;
  /** Override the approval window (minutes). Defaults come from risk level. */
  approvalTtlMinutes?: number;
};

/**
 * How long a proposal stays approvable. Execution always re-validates live
 * state (ticket still open, payout still pending, ...), so the TTL is about
 * reasoning freshness — not a substitute for execution-time checks. Humans
 * review queues on human timescales, so windows are hours/days, not minutes.
 */
export function defaultApprovalTtlMinutes(riskLevel: number): number {
  if (riskLevel >= 3) return 4 * 60; // critical: same shift
  if (riskLevel === 2) return 24 * 60; // money-adjacent: same day
  return 7 * 24 * 60; // routine (briefings, outreach, digests): same week
}

export async function proposeAgentAction(input: ProposeActionInput) {
  const supabase = getSupabaseAdmin();
  const payloadHash = hashPayload(input.proposedPayload);
  const { data, error } = await supabase
    .from("agent_actions")
    .insert({
      tenant_id: input.tenantId,
      agent_id: input.agentId,
      workflow_run_id: input.workflowRunId ?? null,
      action_type: input.actionType,
      target_type: input.targetType,
      target_id: input.targetId,
      proposed_payload: input.proposedPayload,
      payload_hash: payloadHash,
      reasoning_summary: input.reasoningSummary ?? null,
      risk_level: input.riskLevel,
      policy_version: input.policyVersion,
      tool_name: input.toolName ?? null,
      tool_version: input.toolVersion ?? null,
      prompt_version: input.promptVersion ?? null,
      status: "proposed",
      proposed_at: new Date().toISOString(),
      approval_expires_at: new Date(
        Date.now() + (input.approvalTtlMinutes ?? defaultApprovalTtlMinutes(input.riskLevel)) * 60_000,
      ).toISOString(),
      idempotency_key: input.idempotencyKey,
      correlation_id: input.correlationId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  slackNotifyAgentActionProposed({
    tenantId: input.tenantId,
    actionId: data.id,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    riskLevel: input.riskLevel,
    reasoningSummary: input.reasoningSummary,
  });

  emitAgentEvent(
    AMPLITUDE_AGENT_ACTION_PROPOSED,
    {
      action_id: data.id,
      tenant_id: input.tenantId,
      agent_id: input.agentId,
      action_type: input.actionType,
      target_type: input.targetType,
      risk_level: input.riskLevel,
      workflow_run_id: input.workflowRunId ?? null,
      prompt_version: input.promptVersion ?? null,
    },
    `agent_action:${data.id}:proposed`,
  );

  return data;
}

/**
 * Mark overdue proposals as expired so they leave the pending queue and stop
 * occupying the unique open-per-target slot (allowing a fresh proposal with
 * up-to-date reasoning). Run from the sweep cron.
 */
export async function expireStaleProposals(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: candidates } = await supabase
    .from("agent_actions")
    .select("id, workflow_run_id")
    .in("status", ["proposed", "approval_pending"])
    .lt("approval_expires_at", now);

  if (!candidates?.length) return 0;

  let skipRunIds = new Set<string>();
  if (isWorkflowFamilyEnabled("agent")) {
    const { data: runningRuns } = await supabase
      .from("workflow_runs")
      .select("run_id")
      .eq("workflow", "support-triage")
      .eq("status", "running");
    skipRunIds = new Set((runningRuns ?? []).map((row: { run_id: string }) => row.run_id));
  }

  const expireIds = candidates
    .filter((row: { id: string; workflow_run_id?: string | null }) => {
      const runId = row.workflow_run_id ?? null;
      return !(runId && skipRunIds.has(runId));
    })
    .map((row: { id: string }) => row.id);

  if (!expireIds.length) return 0;

  const { data: expired } = await supabase
    .from("agent_actions")
    .update({ status: "expired", updated_at: now })
    .in("id", expireIds)
    .select("id");

  return (expired ?? []).length;
}

export async function acquireExecutionLease(actionId: string, workerId: string, expectedHash: string) {
  const supabase = getSupabaseAdmin();
  const emergency = await loadAgentEmergencyControls();
  const { data: row } = await supabase.from("agent_actions").select("*").eq("id", actionId).maybeSingle();
  if (!row) return { acquired: false, reason: "not_found" as const };

  const ok = canAcquireExecutionLease({
    status: row.status,
    approvalExpiresAt: row.approval_expires_at,
    approvedPayloadHash: row.approved_payload_hash,
    expectedHash,
    leaseExpiresAt: row.lease_expires_at,
    executionAttempts: row.execution_attempts ?? 0,
    maxAttempts: row.max_attempts ?? 3,
    nextRetryAt: row.next_retry_at,
    blockApprovedExecution: emergency.blockApprovedExecution,
  });
  if (!ok) return { acquired: false, reason: "lease_guard_failed" as const };

  const execCheck = validateExecutionApproval({
    status: row.status,
    approvalExpiresAt: row.approval_expires_at,
    approvedPayloadHash: row.approved_payload_hash,
    expectedHash,
    policyVersion: row.policy_version,
    currentPolicyVersion: row.policy_version,
    materialDataChanged: false,
    revoked: row.status === "revoked",
  });
  if (!execCheck.ok) return { acquired: false, reason: execCheck.reason ?? "validation_failed" };

  const { data, error } = await supabase
    .from("agent_actions")
    .update({
      status: "executing",
      lease_owner: workerId,
      lease_acquired_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      executing_at: row.executing_at ?? new Date().toISOString(),
      execution_attempts: (row.execution_attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actionId)
    .in("status", ["approved", "executing", "retryable_failure"])
    .select("*")
    .maybeSingle();

  if (error || !data) return { acquired: false, reason: "race_lost" as const };
  return { acquired: true, action: data };
}

export async function completeExecution(
  actionId: string,
  result: Record<string, unknown>,
  status: Extract<AgentActionStatus, "executed" | "retryable_failure" | "permanent_failure" | "manual_intervention">,
  opts?: { error?: string; retryable?: boolean; nextRetryAt?: string },
) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("agent_actions")
    .update({
      status,
      executed_at: status === "executed" ? new Date().toISOString() : null,
      execution_result: result,
      last_execution_error: opts?.error ?? null,
      retryable: opts?.retryable ?? null,
      next_retry_at: opts?.nextRetryAt ?? null,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actionId);

  emitAgentEvent(
    AMPLITUDE_AGENT_ACTION_EXECUTED,
    {
      action_id: actionId,
      status,
      success: status === "executed",
      retryable: opts?.retryable ?? null,
      error: opts?.error ?? null,
    },
    `agent_action:${actionId}:${status}`,
  );
}

export async function recordApproval(params: {
  actionId: string;
  stage: number;
  requiredRole: string;
  requiredCount: number;
  mustBeDistinctFromStage?: number;
  reviewerId: string;
  reviewerRole: string;
  decision: "approve" | "reject";
  payloadHash: string;
  policyVersion: string;
  comments?: string;
  /** When set, the reviewer's role must be in this list (server-side policy, not client input). */
  allowedReviewerRoles?: string[];
}) {
  if (
    params.allowedReviewerRoles &&
    !params.allowedReviewerRoles.includes(params.reviewerRole)
  ) {
    throw new Error(
      `Reviewer role "${params.reviewerRole}" is not permitted to decide this action type`,
    );
  }
  const supabase = getSupabaseAdmin();
  const { data: req, error: reqErr } = await supabase
    .from("agent_action_approval_requirements")
    .upsert(
      {
        action_id: params.actionId,
        stage: params.stage,
        required_role: params.requiredRole,
        required_count: params.requiredCount,
        must_be_distinct_from_stage: params.mustBeDistinctFromStage ?? null,
      },
      { onConflict: "action_id,stage" },
    )
    .select("*")
    .single();
  if (reqErr) throw reqErr;

  await supabase.from("agent_action_approvals").insert({
    requirement_id: req.id,
    reviewer_id: params.reviewerId,
    reviewer_role_snapshot: params.reviewerRole,
    decision: params.decision,
    payload_hash: params.payloadHash,
    policy_version: params.policyVersion,
    comments: params.comments ?? null,
  });

  if (params.decision === "reject") {
    await supabase.from("agent_actions").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", params.actionId);
    return;
  }

  await supabase.from("agent_actions").update({ status: "approval_pending", updated_at: new Date().toISOString() }).eq("id", params.actionId);

  const { data: action } = await supabase.from("agent_actions").select("*").eq("id", params.actionId).single();
  const { data: reqs } = await supabase.from("agent_action_approval_requirements").select("*").eq("action_id", params.actionId);
  const { data: approvals } = await supabase
    .from("agent_action_approvals")
    .select("*, agent_action_approval_requirements!inner(stage)")
    .eq("agent_action_approval_requirements.action_id", params.actionId);

  const mapped = (approvals ?? []).map((a: any) => ({
    requirementId: a.requirement_id,
    stage: a.agent_action_approval_requirements.stage,
    reviewerId: a.reviewer_id,
    reviewerRoleSnapshot: a.reviewer_role_snapshot,
    decision: a.decision,
    payloadHash: a.payload_hash,
    policyVersion: a.policy_version,
    decidedAt: a.decided_at,
  }));

  const { approvalsSatisfyRequirements } = await import("@beautonomi/agent-policy");
  const check = approvalsSatisfyRequirements(
    (reqs ?? []).map((r) => ({
      stage: r.stage,
      requiredRole: r.required_role,
      requiredCount: r.required_count,
      mustBeDistinctFromStage: r.must_be_distinct_from_stage,
    })),
    mapped,
    action.payload_hash,
  );

  if (check.satisfied) {
    await supabase
      .from("agent_actions")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_payload_hash: action.payload_hash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.actionId);
  }
}
