import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { assignProviderLead } from "@/lib/provider-ops/lead-assign-update";

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

    const result = await assignProviderLead(
      supabase,
      tenantId,
      id,
      {
        assigned_to: body.assigned_to,
        assigned_to_name: body.assigned_to_name,
        expected_updated_at: body.expected_updated_at,
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
      return errorResponse(result.message, "INVALID_ASSIGNEE", 400);
    }

    return successResponse({ id: result.id, assigned_to: result.assigned_to });
  } catch (error) {
    return handleApiError(error, "Failed to assign lead");
  }
}
