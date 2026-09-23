import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { changeProviderLeadStage } from "@/lib/provider-ops/lead-stage-update";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireProviderOpsSales(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const tenantId = await resolveAdminApiTenantId(request);

    const result = await changeProviderLeadStage(
      supabase,
      tenantId,
      id,
      {
        stage: body.stage,
        expected_updated_at: body.expected_updated_at,
        matched_provider_id: body.matched_provider_id,
        match_confidence: body.match_confidence,
        lost_reason: body.lost_reason,
      },
      { id: user.id, role: user.role },
      request,
    );

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return errorResponse(result.message, "NOT_FOUND", 404);
      }
      if (result.code === "CONCURRENT_UPDATE") {
        return errorResponse(result.message, "CONCURRENT_UPDATE", 409);
      }
      return errorResponse(result.message, "VALIDATION_ERROR", 400);
    }

    return successResponse({
      id: result.id,
      stage: result.stage,
      previous_stage: result.previous_stage,
    });
  } catch (error) {
    return handleApiError(error, "Failed to change stage");
  }
}
