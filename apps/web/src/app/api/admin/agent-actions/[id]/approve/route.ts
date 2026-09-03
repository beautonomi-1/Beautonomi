import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { recordApproval } from "@/lib/agents/actions/action-service";
import { getAgentApprovalPolicy } from "@/lib/agents/actions/approval-policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { resumeAgentApprovalHook } from "@/workflows/resume-agent-approval-hook";

/**
 * Approve an agent action. Approval requirements (role, count, maker-checker)
 * come from the server-side policy matrix keyed on the action's own
 * action_type — the client can only supply a comment.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();
    const { data: action } = await supabase.from("agent_actions").select("*").eq("id", id).maybeSingle();
    if (!action) return handleApiError(new Error("Not found"), "Action not found", "NOT_FOUND", 404);

    const policy = getAgentApprovalPolicy(String(action.action_type ?? ""));
    if (!policy) {
      return handleApiError(
        new Error(`No approval policy for action type ${action.action_type}`),
        "This action type has no approval policy and cannot be approved",
        "NO_POLICY",
        400,
      );
    }

    const { user } = await requireAdminSection(policy.section, request);
    const tenantId = await resolveAdminApiTenantId(request);
    if (String((action as { tenant_id?: string }).tenant_id) !== tenantId) {
      return handleApiError(new Error("Forbidden"), "Action not in admin tenant scope", "FORBIDDEN", 403);
    }

    const body = await request.json().catch(() => ({}));

    await recordApproval({
      actionId: id,
      stage: policy.stage,
      requiredRole: policy.approverRoles[0],
      requiredCount: policy.requiredCount,
      reviewerId: user.id,
      reviewerRole: user.role ?? "",
      decision: "approve",
      payloadHash: action.payload_hash,
      policyVersion: action.policy_version,
      comments: typeof body.comments === "string" ? body.comments : undefined,
      allowedReviewerRoles: policy.approverRoles,
    });

    const { data: updated } = await supabase
      .from("agent_actions")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if ((updated as { status?: string } | null)?.status === "approved") {
      await resumeAgentApprovalHook(id, "approve");
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.agent_action.approve",
      entity_type: "agent_action",
      entity_id: id,
      module: policy.auditModule,
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      ok: true,
      status: (updated as { status?: string } | null)?.status ?? "approval_pending",
      required_approvals: policy.requiredCount,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to approve agent action");
  }
}
