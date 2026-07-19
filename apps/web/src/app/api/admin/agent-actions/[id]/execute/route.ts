import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { acquireExecutionLease, completeExecution } from "@/lib/agents/actions/action-service";
import { getAgentApprovalPolicy } from "@/lib/agents/actions/approval-policy";
import { assertAgentMutationAllowed } from "@/lib/agents/safety-gate";
import { loadAgentModuleConfig } from "@/lib/agents/config-loader";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { executeApprovedAgentAction } from "@/lib/agents/actions/execute-approved-agent-action";

/** Execute an approved agent action — deterministic posting only after lease + gates. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();
    const { data: action } = await supabase
      .from("agent_actions")
      .select("tenant_id, action_type, target_type, target_id, proposed_payload")
      .eq("id", id)
      .maybeSingle();
    if (!action) return handleApiError(new Error("Not found"), "Action not found", "NOT_FOUND", 404);

    const policy = getAgentApprovalPolicy(String((action as { action_type?: string }).action_type ?? ""));
    if (!policy) {
      return handleApiError(
        new Error("No approval policy for this action type"),
        "This action type has no approval policy and cannot be executed",
        "NO_POLICY",
        400,
      );
    }

    const { user } = await requireAdminSection(policy.section, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json().catch(() => ({}));

    if (String((action as { tenant_id?: string }).tenant_id) !== tenantId) {
      return handleApiError(new Error("Forbidden"), "Action not in admin tenant scope", "FORBIDDEN", 403);
    }

    const module = await loadAgentModuleConfig();
    const gate = assertAgentMutationAllowed({
      masterEnabled: module.masterEnabled,
      shadowMode: module.shadowMode,
      rlsHarnessGreen: process.env.AGENT_RLS_HARNESS_GREEN === "true",
    });
    if (!gate.allowed) {
      return successResponse({ executed: false, gate: gate.blockers });
    }

    // Default the expected hash to the action's current payload hash; the lease
    // still verifies it equals the hash pinned at approval time, so any payload
    // drift after approval blocks execution.
    const { data: hashRow } = await supabase
      .from("agent_actions")
      .select("payload_hash")
      .eq("id", id)
      .maybeSingle();
    const expectedHash =
      typeof body.expected_payload_hash === "string" && body.expected_payload_hash
        ? body.expected_payload_hash
        : ((hashRow as { payload_hash?: string } | null)?.payload_hash ?? "");

    const lease = await acquireExecutionLease(id, `worker-${user.id}`, expectedHash);
    if (!lease.acquired) {
      return successResponse({ executed: false, reason: lease.reason });
    }

    const exec = await executeApprovedAgentAction({
      supabase,
      tenantId,
      actorUserId: user.id,
      actionType: String((action as { action_type?: string }).action_type ?? ""),
      targetType: String((action as { target_type?: string }).target_type ?? ""),
      targetId: String((action as { target_id?: string }).target_id ?? ""),
      proposedPayload: ((action as { proposed_payload?: Record<string, unknown> }).proposed_payload ??
        {}) as Record<string, unknown>,
    });

    if (exec.ok === false) {
      await completeExecution(
        id,
        { reason: exec.reason },
        exec.retryable ? "retryable_failure" : "permanent_failure",
        { error: exec.reason, retryable: exec.retryable },
      );
      return successResponse({ executed: false, reason: exec.reason });
    }

    await completeExecution(id, exec.result, "executed");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.agent_action.execute",
      entity_type: "agent_action",
      entity_id: id,
      module: policy.auditModule,
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ executed: true, result: exec.result });
  } catch (error) {
    return handleApiError(error as Error, "Failed to execute agent action");
  }
}
