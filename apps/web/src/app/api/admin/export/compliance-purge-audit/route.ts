import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import {
  fetchCompliancePurgeAuditForExport,
  readCompliancePurgeAuditFilters,
  validatePurgeTypeFilter,
} from "@/lib/compliance/purge-audit-query";

/**
 * GET /api/admin/export/compliance-purge-audit
 *
 * Superadmin only. CSV export of compliance purge audit rows (no report JSON).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { allowed, retryAfter } = await checkAdminExportRateLimit(
      user.id,
      "export:compliance-purge-audit",
    );
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429,
      );
    }

    const { searchParams } = new URL(request.url);
    const filters = readCompliancePurgeAuditFilters(searchParams);
    if (!validatePurgeTypeFilter(filters.purge_type)) {
      return errorResponse("Invalid purge_type filter", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const { rows, truncated, error } = await fetchCompliancePurgeAuditForExport(admin, filters);

    if (error) {
      return handleApiError(new Error(error.message), "Failed to export compliance purge audit");
    }

    const headers = [
      "ID",
      "Created At",
      "Purge Type",
      "Actor User ID",
      "Actor Name",
      "Actor Email",
      "Tenant ID",
      "Target User ID",
      "Provider ID",
      "Purged User IDs",
      "Reason",
      "Purge After At",
    ];

    const csvRows = rows.map((row) => [
      row.id,
      row.created_at,
      row.purge_type ?? "",
      row.actor_user_id ?? "",
      row.actor?.full_name ?? "",
      row.actor?.email ?? "",
      row.tenant_id ?? "",
      row.target_user_id ?? "",
      row.provider_id ?? "",
      (row.purged_user_ids ?? []).join(";"),
      row.reason ?? "",
      row.purge_after_at ?? "",
    ]);

    const note = truncated
      ? `\n"# Export capped at ${rows.length} rows; narrow filters for full history."`
      : "";

    const csvContent =
      [headers.join(","), ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join(
        "\n",
      ) + note;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="compliance-purge-audit-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export compliance purge audit");
  }
}
