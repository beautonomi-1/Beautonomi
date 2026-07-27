import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * PATCH /api/admin/content-reports/[id]
 * Resolve or dismiss a content report (superadmin).
 * Body: { status: 'resolved' | 'dismissed', resolution_notes?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const status = body.status;
    const resolutionNotes =
      typeof body.resolution_notes === "string"
        ? body.resolution_notes.trim()
        : null;

    if (!status || !["resolved", "dismissed"].includes(status)) {
      return errorResponse(
        "status must be 'resolved' or 'dismissed'",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("content_reports")
      .select("id, status, tenant_id, target_type, target_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if ((existing as { tenant_id?: string }).tenant_id !== tenantId) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if (existing.status !== "pending") {
      return errorResponse(
        "Report is already resolved or dismissed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: updated, error } = await supabase
      .from("content_reports")
      .update({
        status,
        resolution_notes: resolutionNotes ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status, resolution_notes, resolved_at, target_type, target_id")
      .single();

    if (error) return handleApiError(error, "Failed to update content report");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content_report.resolve",
      entity_type: "content_report",
      entity_id: id,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      metadata: {
        status,
        target_type: (existing as { target_type?: string }).target_type,
        target_id: (existing as { target_id?: string }).target_id,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update content report");
  }
}
