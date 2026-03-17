import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse,
  handleApiError, } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/user-reports
 * List user reports (customer vs provider). Superadmin only.
 * Query: status=pending|resolved|dismissed, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = await getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = supabase
      .from("user_reports")
      .select(
        "id, reporter_id, reported_user_id, report_type, description, booking_id, status, resolution_notes, resolved_by, resolved_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ["pending", "resolved", "dismissed"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data: rows, error } = await query;

    if (error) return handleApiError(error, "Failed to fetch reports");

    type ReportRow = { reporter_id?: string; reported_user_id?: string; id: string; report_type?: string; description?: string; booking_id?: string; status?: string; resolution_notes?: string; resolved_by?: string; resolved_at?: string; created_at?: string; updated_at?: string };
    type UserMapRow = { id: string; full_name: string | null; email: string };
    const userIds = [
      ...new Set(
        (rows || []).flatMap((r: ReportRow) => [r.reporter_id, r.reported_user_id].filter(Boolean) as string[])
      ),
    ].filter(Boolean);

    let userMap: Record<string, UserMapRow> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      userMap = (users || []).reduce<Record<string, UserMapRow>>(
        (acc, u: UserMapRow) => {
          acc[u.id] = { id: u.id, full_name: u.full_name, email: u.email };
          return acc;
        },
        {}
      );
    }

    const reports = (rows || []).map((r: ReportRow) => ({
      id: r.id,
      reporter_id: r.reporter_id,
      reported_user_id: r.reported_user_id,
      report_type: r.report_type,
      description: r.description,
      booking_id: r.booking_id,
      status: r.status,
      resolution_notes: r.resolution_notes,
      resolved_by: r.resolved_by,
      resolved_at: r.resolved_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      reporter: userMap[r.reporter_id] ?? null,
      reported: userMap[r.reported_user_id] ?? null,
    }));

    return successResponse({
      data: reports,
      has_more: reports.length === limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch reports");
  }
}
