import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/user-reports/summary?user_id=...
 * Returns adverse finding summary for a given user (reports against them).
 * Used to show report counts and flag status on user/provider detail pages.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return errorResponse("user_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: reports, error } = await supabase
      .from("user_reports")
      .select("id, reporter_id, status, is_adverse_finding, admin_action_taken, created_at, resolved_at")
      .eq("reported_user_id", userId)
      .eq("tenant_id", tenantId);

    if (error) return handleApiError(error, "Failed to fetch report summary");

    const rows = reports || [];
    const totalReports = rows.filter(r => r.status !== "dismissed").length;
    const adverseFindings = rows.filter(r => r.is_adverse_finding === true);
    const adverseFindingCount = adverseFindings.length;
    const uniqueAdverseReporters = new Set(adverseFindings.map(r => r.reporter_id)).size;
    const isFlagged = uniqueAdverseReporters >= 3;
    const lastAdverseFindingAt = adverseFindings.length > 0
      ? adverseFindings.sort((a, b) =>
          new Date(b.resolved_at || 0).getTime() - new Date(a.resolved_at || 0).getTime()
        )[0]?.resolved_at ?? null
      : null;

    const actionsTaken = adverseFindings
      .filter(r => r.admin_action_taken)
      .map(r => r.admin_action_taken as string);

    return successResponse({
      user_id: userId,
      total_reports: totalReports,
      adverse_finding_count: adverseFindingCount,
      unique_adverse_reporters: uniqueAdverseReporters,
      is_flagged: isFlagged,
      flag_threshold: 3,
      last_adverse_finding_at: lastAdverseFindingAt,
      actions_taken: actionsTaken,
      pending_count: rows.filter(r => r.status === "pending").length,
      dismissed_count: rows.filter(r => r.status === "dismissed").length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch report summary");
  }
}
