import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";
import { recordAtRiskSaveForCase } from "@/lib/provider-ops/ops-case";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/provider-ops/cases/[id]/record-at-risk-save
 * Retention records a successful intervention for a provider with declining bookings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireOpsDesk(["retention"], request);
    const { id: caseId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const result = await recordAtRiskSaveForCase(supabase, {
      tenantId,
      caseId,
      actorUserId: user.id,
    });

    if ("error" in result) {
      if (result.error === "not_found") {
        return notFoundResponse("Case not found");
      }
      if (result.error === "not_at_risk") {
        return errorResponse(
          "This provider does not meet at-risk booking trend criteria right now.",
          "VALIDATION_ERROR",
          400,
        );
      }
      return errorResponse(result.message ?? "Case cannot be saved", "VALIDATION_ERROR", 400);
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.at_risk_save_recorded",
      entity_type: "provider_ops_case",
      entity_id: caseId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { already_recorded: result.alreadyRecorded ?? false },
      ...extractRequestMeta(request),
    });

    return successResponse({
      case_id: caseId,
      at_risk_saved_at: result.atRiskSavedAt,
      already_recorded: result.alreadyRecorded ?? false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to record at-risk save");
  }
}
