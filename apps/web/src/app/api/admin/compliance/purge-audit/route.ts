import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  fetchCompliancePurgeAuditById,
  fetchCompliancePurgeAuditList,
  isValidCompliancePurgeAuditId,
  parseCompliancePurgeAuditPagination,
  readCompliancePurgeAuditFilters,
  validatePurgeTypeFilter,
} from "@/lib/compliance/purge-audit-query";

/**
 * GET /api/admin/compliance/purge-audit
 *
 * Superadmin only. Paginated, filterable compliance purge log.
 * GET ?id=<uuid> returns a single row including `report`.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const detailId = searchParams.get("id")?.trim();
    if (detailId) {
      if (!isValidCompliancePurgeAuditId(detailId)) {
        return errorResponse("Invalid audit id", "VALIDATION_ERROR", 400);
      }
      const { data, error } = await fetchCompliancePurgeAuditById(admin, detailId);
      if (error) {
        return Response.json(
          { data: null, error: { message: error.message, code: "QUERY_FAILED" } },
          { status: 500 },
        );
      }
      if (!data) {
        return notFoundResponse("Compliance purge audit entry not found");
      }
      return successResponse({ entry: data });
    }

    const filters = readCompliancePurgeAuditFilters(searchParams);
    if (!validatePurgeTypeFilter(filters.purge_type)) {
      return errorResponse("Invalid purge_type filter", "VALIDATION_ERROR", 400);
    }

    const { page, limit, offset } = parseCompliancePurgeAuditPagination(searchParams);
    const { rows, count, error } = await fetchCompliancePurgeAuditList(admin, {
      filters,
      offset,
      limit,
    });

    if (error) {
      return Response.json(
        { data: null, error: { message: error.message, code: "QUERY_FAILED" } },
        { status: 500 },
      );
    }

    const total = count;
    return successResponse({
      entries: rows,
      meta: {
        page,
        limit,
        total,
        has_more: total > page * limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load compliance purge audit");
  }
}
