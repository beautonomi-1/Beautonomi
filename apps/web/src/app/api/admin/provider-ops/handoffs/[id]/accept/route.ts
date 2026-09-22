import { requireProviderOpsAnyDesk } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { isOpsDeskManager } from "@/lib/provider-ops/ops-desk-roles";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";

function ownerColumnForDesk(desk: OpsDesk): string {
  if (desk === "sales") return "sales_owner_id";
  if (desk === "onboarding") return "onboarding_owner_id";
  return "retention_owner_id";
}

/**
 * POST /api/admin/provider-ops/handoffs/[id]/accept
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireProviderOpsAnyDesk(request);
    const { id: handoffId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: handoff, error: handoffErr } = await supabase
      .from("provider_ops_handoffs")
      .select("*")
      .eq("id", handoffId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (handoffErr) throw handoffErr;
    if (!handoff) return notFoundResponse("Handoff not found");

    if (handoff.status !== "pending") {
      return errorResponse("Handoff is not pending", "INVALID_STATE", 400);
    }

    const manager = isOpsDeskManager(user.role);
    if (!manager && handoff.to_user_id && handoff.to_user_id !== user.id) {
      return errorResponse("This handoff is assigned to another user", "FORBIDDEN", 403);
    }
    const assigneeId = (handoff.to_user_id as string | null) ?? user.id;

    const toDesk = handoff.to_desk as OpsDesk;
    const ownerCol = ownerColumnForDesk(toDesk);
    const now = new Date().toISOString();

    const { error: handoffUpdErr } = await supabase
      .from("provider_ops_handoffs")
      .update({
        status: "accepted",
        to_user_id: assigneeId,
        accepted_at: now,
      })
      .eq("id", handoffId);
    if (handoffUpdErr) throw handoffUpdErr;

    const caseUpdate: Record<string, unknown> = {
      current_desk: toDesk,
      [ownerCol]: assigneeId,
    };

    const { error: caseErr } = await supabase
      .from("provider_ops_cases")
      .update(caseUpdate)
      .eq("id", handoff.case_id as string)
      .eq("tenant_id", tenantId);
    if (caseErr) throw caseErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.handoff.accept",
      entity_type: "provider_ops_handoff",
      entity_id: handoffId,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { case_id: handoff.case_id, to_desk: toDesk },
      ...extractRequestMeta(request),
    });

    return successResponse({ handoff_id: handoffId, accepted_by: assigneeId, to_desk: toDesk });
  } catch (error) {
    return handleApiError(error, "Failed to accept handoff");
  }
}
