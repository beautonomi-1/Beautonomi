import type { UserRole } from "@/types/beautonomi";
import { acquireExecutionLease, completeExecution } from "@/lib/agents/actions/action-service";
import { assertAgentMutationAllowed } from "@/lib/agents/safety-gate";
import { loadAgentModuleConfig } from "@/lib/agents/config-loader";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { executeApprovedAgentAction } from "@/lib/agents/actions/execute-approved-agent-action";

export type RunAgentExecuteResult =
  | { executed: true; result: Record<string, unknown> }
  | { executed: false; reason: string };

/** Execute an approved agent action (same gates as POST .../execute). */
export async function runAgentActionExecuteForUser(
  actionId: string,
  user: { id: string; role?: UserRole | string | null },
): Promise<RunAgentExecuteResult> {
  const supabase = getSupabaseAdmin();
  const { data: action } = await supabase
    .from("agent_actions")
    .select("tenant_id, action_type, target_type, target_id, proposed_payload, status, payload_hash")
    .eq("id", actionId)
    .maybeSingle();
  if (!action) return { executed: false, reason: "not_found" };
  if ((action as { status?: string }).status !== "approved") {
    return { executed: false, reason: "not_approved" };
  }

  const agentModule = await loadAgentModuleConfig();
  const gate = assertAgentMutationAllowed({
    masterEnabled: agentModule.masterEnabled,
    shadowMode: agentModule.shadowMode,
    rlsHarnessGreen: process.env.AGENT_RLS_HARNESS_GREEN === "true",
  });
  if (!gate.allowed) {
    return { executed: false, reason: gate.blockers.join("; ") || "blocked" };
  }

  const expectedHash = (action as { payload_hash?: string }).payload_hash ?? "";
  const lease = await acquireExecutionLease(actionId, `worker-${user.id}`, expectedHash);
  if (!lease.acquired) {
    return { executed: false, reason: lease.reason ?? "lease_failed" };
  }

  const exec = await executeApprovedAgentAction({
    supabase,
    tenantId: String((action as { tenant_id?: string }).tenant_id),
    actorUserId: user.id,
    actionType: String((action as { action_type?: string }).action_type ?? ""),
    targetType: String((action as { target_type?: string }).target_type ?? ""),
    targetId: String((action as { target_id?: string }).target_id ?? ""),
    proposedPayload: ((action as { proposed_payload?: Record<string, unknown> }).proposed_payload ??
      {}) as Record<string, unknown>,
  });

  if (exec.ok === false) {
    await completeExecution(
      actionId,
      { reason: exec.reason },
      exec.retryable ? "retryable_failure" : "permanent_failure",
      { error: exec.reason, retryable: exec.retryable },
    );
    return { executed: false, reason: exec.reason };
  }

  await completeExecution(actionId, exec.result, "executed");
  return { executed: true, result: exec.result };
}
