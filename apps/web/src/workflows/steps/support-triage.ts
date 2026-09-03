import { FatalError } from "workflow";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadAgentDefinition,
  loadAgentEmergencyControls,
  loadAgentModuleConfig,
  loadAgentOperationalState,
} from "@/lib/agents/config-loader";
import { assertAgentMutationAllowed, assertAgentReadAllowed } from "@/lib/agents/safety-gate";
import {
  acquireExecutionLease,
  completeExecution,
} from "@/lib/agents/actions/action-service";
import { executeApprovedAgentAction } from "@/lib/agents/actions/execute-approved-agent-action";
import { resolveSupportTicketTenantId } from "@/lib/agents/support-ticket-tenant";
import {
  classifyAndProposeForTicket,
  type SupportTriageProposal,
} from "@/lib/agents/workflows/support-agent";

export type TriageGateResult =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      ticketId: string;
      tenantId: string;
      agentId: string;
      agentVersion: string;
      shadowMode: boolean;
    };

export async function triageGate(ticketId: string, environment?: string): Promise<TriageGateResult> {
  "use step";

  const agentModule = await loadAgentModuleConfig(environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) {
    throw new FatalError(gate.reason ?? "agent_gated");
  }

  // Kill switch: emergency controls stop new runs regardless of module state.
  const emergency = await loadAgentEmergencyControls(environment);
  if (emergency.stopNewRuns) {
    throw new FatalError("emergency_stop_new_runs");
  }

  const def = await loadAgentDefinition("support-triage");
  if (!def) {
    throw new FatalError("support_triage_not_configured");
  }

  const op = await loadAgentOperationalState("support-triage");
  if (op.state !== "active") {
    return { allowed: false, reason: "agent_not_active" };
  }

  const supabase = getSupabaseAdmin();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, status, provider_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    return { allowed: false, reason: "ticket_not_found" };
  }
  if (!["open", "in_progress"].includes(String(ticket.status))) {
    return { allowed: false, reason: `ticket_status_${ticket.status}` };
  }

  const tenantId = await resolveSupportTicketTenantId(supabase, ticket);
  if (!tenantId) {
    return { allowed: false, reason: "tenant_unresolved" };
  }

  return {
    allowed: true,
    ticketId,
    tenantId,
    agentId: def.id,
    agentVersion: def.active_version,
    shadowMode: agentModule.shadowMode,
  };
}

export type WorkflowProposal = {
  type: string;
  actionId: string;
  approvalExpiresAt: string | null;
};

export async function classifyAndPropose(
  ticketId: string,
  workflowRunId: string,
  gate: Extract<TriageGateResult, { allowed: true }>,
): Promise<WorkflowProposal[]> {
  "use step";

  const result = await classifyAndProposeForTicket({
    ticketId,
    workflowRunId,
    tenantId: gate.tenantId,
    agentId: gate.agentId,
    agentVersion: gate.agentVersion,
    shadowMode: gate.shadowMode,
  });

  return result.proposals
    .filter((p): p is SupportTriageProposal & { actionId: string } => Boolean(p.actionId))
    .map((p) => ({
      type: p.type,
      actionId: p.actionId,
      approvalExpiresAt: p.approvalExpiresAt ?? null,
    }));
}

export async function readActionStatus(actionId: string): Promise<string | null> {
  "use step";

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_actions")
    .select("status")
    .eq("id", actionId)
    .maybeSingle();
  return (data as { status?: string } | null)?.status ?? null;
}

async function resolveWorkflowActorUserId(actionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: approvals } = await supabase
    .from("agent_action_approvals")
    .select("reviewer_id, decision, agent_action_approval_requirements!inner(action_id)")
    .eq("agent_action_approval_requirements.action_id", actionId)
    .eq("decision", "approve")
    .order("decided_at", { ascending: false })
    .limit(1);

  const reviewerId = (approvals?.[0] as { reviewer_id?: string } | undefined)?.reviewer_id;
  if (reviewerId) return reviewerId;

  const { data: staff } = await supabase
    .from("users")
    .select("id")
    .in("role", ["superadmin", "admin_support", "support_agent"])
    .limit(1)
    .maybeSingle();

  return (staff as { id?: string } | null)?.id ?? null;
}

export async function executeApproved(actionId: string): Promise<void> {
  "use step";

  const supabase = getSupabaseAdmin();
  const { data: action } = await supabase
    .from("agent_actions")
    .select(
      "id, tenant_id, action_type, target_type, target_id, proposed_payload, payload_hash, status",
    )
    .eq("id", actionId)
    .maybeSingle();

  if (!action) {
    throw new FatalError("action_not_found");
  }
  if (String(action.status) !== "approved") {
    return;
  }

  const agentModule = await loadAgentModuleConfig();
  const gate = assertAgentMutationAllowed({
    masterEnabled: agentModule.masterEnabled,
    shadowMode: agentModule.shadowMode,
    rlsHarnessGreen: process.env.AGENT_RLS_HARNESS_GREEN === "true",
  });
  if (!gate.allowed) {
    throw new FatalError(`execution_gated:${gate.blockers.join(",")}`);
  }

  const actorUserId = await resolveWorkflowActorUserId(actionId);
  if (!actorUserId) {
    throw new FatalError("workflow_actor_unresolved");
  }

  const expectedHash = String(action.payload_hash ?? "");
  const lease = await acquireExecutionLease(actionId, "workflow-support-triage", expectedHash);
  if (!lease.acquired) {
    throw new Error(`executeApproved lease failed: ${lease.reason}`);
  }

  const exec = await executeApprovedAgentAction({
    supabase,
    tenantId: String(action.tenant_id),
    actorUserId,
    actionType: String(action.action_type ?? ""),
    targetType: String(action.target_type ?? ""),
    targetId: String(action.target_id ?? ""),
    proposedPayload: ((action.proposed_payload ?? {}) as Record<string, unknown>),
  });

  if (exec.ok === false) {
    await completeExecution(
      actionId,
      { reason: exec.reason },
      exec.retryable ? "retryable_failure" : "permanent_failure",
      { error: exec.reason, retryable: exec.retryable },
    );
    if (!exec.retryable) {
      throw new FatalError(exec.reason);
    }
    throw new Error(exec.reason);
  }

  await completeExecution(actionId, exec.result, "executed");
}

export async function recordOutcome(
  actionId: string,
  outcome: "reject" | "timeout",
): Promise<void> {
  "use step";

  const supabase = getSupabaseAdmin();
  const { data: action } = await supabase
    .from("agent_actions")
    .select("id, status")
    .eq("id", actionId)
    .maybeSingle();

  if (!action) return;

  if (outcome === "reject") {
    if (String(action.status) === "rejected") return;
    await supabase
      .from("agent_actions")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", actionId);
    return;
  }

  if (!["proposed", "approval_pending", "approved"].includes(String(action.status))) {
    return;
  }

  await supabase
    .from("agent_actions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", actionId);
}
