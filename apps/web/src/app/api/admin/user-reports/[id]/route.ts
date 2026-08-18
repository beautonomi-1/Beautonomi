import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * GET /api/admin/user-reports/[id]
 * Fetch a single report with full details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSectionAny(
      [ADMIN_SECTION_USERS_TRUST, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("user_reports")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch report");
  }
}

/**
 * PATCH /api/admin/user-reports/[id]
 * Resolve or dismiss a report. Supports marking as adverse finding.
 * Body: { status: 'resolved' | 'dismissed', resolution_notes?: string, is_adverse_finding?: boolean, admin_action_taken?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_USERS_TRUST, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const status = body.status;
    const resolutionNotes =
      typeof body.resolution_notes === "string"
        ? body.resolution_notes.trim()
        : null;
    const isAdverseFinding = body.is_adverse_finding === true;
    const adminActionTaken =
      typeof body.admin_action_taken === "string"
        ? body.admin_action_taken.trim()
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
      .from("user_reports")
      .select("id, status, tenant_id, reported_user_id")
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
      .from("user_reports")
      .update({
        status,
        resolution_notes: resolutionNotes ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        is_adverse_finding: status === "resolved" ? isAdverseFinding : false,
        admin_action_taken: isAdverseFinding ? adminActionTaken : null,
      })
      .eq("id", id)
      .select("id, status, resolution_notes, resolved_at, is_adverse_finding, admin_action_taken")
      .single();

    if (error) return handleApiError(error, "Failed to update report");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user_report.resolve",
      entity_type: "user_report",
      entity_id: id,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { status, is_adverse_finding: isAdverseFinding },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update report");
  }
}
