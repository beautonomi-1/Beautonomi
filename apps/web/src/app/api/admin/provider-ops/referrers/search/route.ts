import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { searchReferrersInTenant } from "@/lib/provider-ops/resolve-referrer";

/**
 * GET /api/admin/provider-ops/referrers/search?q=
 * Search tenant-scoped providers and users for lead referrer assignment.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return errorResponse("Search query must be at least 2 characters", "VALIDATION_ERROR", 400);
    }

    const results = await searchReferrersInTenant(supabase, tenantId, q);
    return successResponse({ results });
  } catch (error) {
    return handleApiError(error, "Failed to search referrers");
  }
}
