import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/user-reports
 * List user reports with adverse finding enrichment.
 * Query: status=pending|resolved|dismissed, limit, offset, reported_user_id
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny(
      [ADMIN_SECTION_USERS_TRUST, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const reportedUserId = searchParams.get("reported_user_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = supabase
      .from("user_reports")
      .select(
        "id, reporter_id, reported_user_id, report_type, description, booking_id, tenant_id, status, resolution_notes, resolved_by, resolved_at, is_adverse_finding, admin_action_taken, created_at, updated_at",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ["pending", "resolved", "dismissed"].includes(status)) {
      query = query.eq("status", status);
    }
    if (reportedUserId) {
      query = query.eq("reported_user_id", reportedUserId);
    }

    const { data: rows, error, count } = await query;

    if (error) return handleApiError(error, "Failed to fetch reports");

    type ReportRow = {
      reporter_id?: string;
      reported_user_id?: string;
      id: string;
      report_type?: string;
      description?: string;
      booking_id?: string;
      tenant_id?: string;
      status?: string;
      resolution_notes?: string;
      resolved_by?: string;
      resolved_at?: string;
      is_adverse_finding?: boolean;
      admin_action_taken?: string;
      created_at?: string;
      updated_at?: string;
    };
    type UserMapRow = { id: string; full_name: string | null; email: string; role?: string };
    const userIds = [
      ...new Set(
        (rows || []).flatMap((r: ReportRow) => [r.reporter_id, r.reported_user_id].filter(Boolean) as string[])
      ),
    ].filter(Boolean);

    let userMap: Record<string, UserMapRow> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .in("id", userIds);
      userMap = (users || []).reduce<Record<string, UserMapRow>>(
        (acc, u: UserMapRow) => {
          acc[u.id] = { id: u.id, full_name: u.full_name, email: u.email, role: u.role };
          return acc;
        },
        {}
      );
    }

    // Build adverse-finding summary per reported user in current result set
    const reportedUserIds = [...new Set((rows || []).map((r: ReportRow) => r.reported_user_id).filter(Boolean) as string[])];
    type AdverseSummary = { total: number; adverse: number; unique_reporters: number; is_flagged: boolean };
    const adverseSummaryMap: Record<string, AdverseSummary> = {};

    if (reportedUserIds.length > 0) {
      const { data: allReportsForUsers } = await supabase
        .from("user_reports")
        .select("reported_user_id, reporter_id, status, is_adverse_finding")
        .eq("tenant_id", tenantId)
        .in("reported_user_id", reportedUserIds);

      for (const uid of reportedUserIds) {
        const userReports = (allReportsForUsers || []).filter(
          (r: { reported_user_id: string }) => r.reported_user_id === uid
        );
        const adverse = userReports.filter((r: { is_adverse_finding?: boolean }) => r.is_adverse_finding === true);
        const uniqueReporters = new Set(adverse.map((r: { reporter_id: string }) => r.reporter_id)).size;
        adverseSummaryMap[uid] = {
          total: userReports.filter((r: { status: string }) => r.status !== "dismissed").length,
          adverse: adverse.length,
          unique_reporters: uniqueReporters,
          is_flagged: uniqueReporters >= 3,
        };
      }
    }

    const reports = (rows || []).map((r: ReportRow) => ({
      ...r,
      reporter: userMap[r.reporter_id ?? ""] ?? null,
      reported: userMap[r.reported_user_id ?? ""] ?? null,
      adverse_summary: adverseSummaryMap[r.reported_user_id ?? ""] ?? null,
    }));

    return successResponse({
      data: reports,
      total: count ?? reports.length,
      has_more: offset + limit < (count ?? reports.length),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch reports");
  }
}
