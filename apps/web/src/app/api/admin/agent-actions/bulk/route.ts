import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAdminSection,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { recordApproval } from "@/lib/agents/actions/action-service";
import { getAgentApprovalPolicy } from "@/lib/agents/actions/approval-policy";
import { runAgentActionExecuteForUser } from "@/lib/agents/actions/run-agent-action-execute";
import { resumeAgentApprovalHook } from "@/workflows/resume-agent-approval-hook";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const MAX_IDS = 50;

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
  decision: z.enum(["approve", "reject"]),
  execute: z.boolean().optional(),
  comments: z.string().optional(),
});

/**
 * POST /api/admin/agent-actions/bulk
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.flatten().formErrors.join("; ") || "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    const { user: bulkActor } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const uniqueIds = [...new Set(parsed.data.ids)];
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const results: {
      id: string;
      status: string;
      executed?: boolean;
      error?: string;
    }[] = [];

    for (const id of uniqueIds) {
      const { data: action } = await supabase.from("agent_actions").select("*").eq("id", id).maybeSingle();
      if (!action) {
        results.push({ id, status: "error", error: "not_found" });
        continue;
      }
      if (String((action as { tenant_id?: string }).tenant_id) !== tenantId) {
        results.push({ id, status: "error", error: "forbidden" });
        continue;
      }

      const policy = getAgentApprovalPolicy(String(action.action_type ?? ""));
      if (!policy) {
        results.push({ id, status: "error", error: "no_policy" });
        continue;
      }

      let user: { id: string; role?: string | null };
      try {
        const auth = await requireAdminSection(policy.section, request);
        user = auth.user;
      } catch {
        results.push({ id, status: "error", error: "forbidden" });
        continue;
      }

      try {
        await recordApproval({
          actionId: id,
          stage: policy.stage,
          requiredRole: policy.approverRoles[0],
          requiredCount: policy.requiredCount,
          reviewerId: user.id,
          reviewerRole: user.role ?? "",
          decision: parsed.data.decision === "approve" ? "approve" : "reject",
          payloadHash: action.payload_hash,
          policyVersion: action.policy_version,
          comments: parsed.data.comments,
          allowedReviewerRoles: policy.approverRoles,
        });

        const { data: updated } = await supabase.from("agent_actions").select("status").eq("id", id).maybeSingle();
        const status = (updated as { status?: string } | null)?.status ?? "unknown";

        if (parsed.data.decision === "approve") {
          await resumeAgentApprovalHook(id, "approve");
        } else {
          await resumeAgentApprovalHook(id, "reject");
        }

        let executed: boolean | undefined;
        if (parsed.data.decision === "approve" && parsed.data.execute && status === "approved") {
          const exec = await runAgentActionExecuteForUser(id, user);
          executed = exec.executed;
          if (!exec.executed) {
            results.push({ id, status, executed: false, error: exec.reason });
            continue;
          }
        }

        results.push({ id, status, ...(executed !== undefined ? { executed } : {}) });
      } catch (e) {
        results.push({
          id,
          status: "error",
          error: e instanceof Error ? e.message : "failed",
        });
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: bulkActor.id,
      actor_role: bulkActor.role,
      action: "admin.agent_action.bulk",
      entity_type: "agent_action",
      entity_id: `${parsed.data.decision}_${uniqueIds.length}`,
      module: "agents",
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      metadata: {
        decision: parsed.data.decision,
        execute: parsed.data.execute ?? false,
        count: uniqueIds.length,
      },
    });

    return successResponse({ results });
  } catch (error) {
    return handleApiError(error as Error, "Failed to bulk decide agent actions");
  }
}
