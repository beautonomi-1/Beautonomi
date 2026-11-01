import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validateCountryLaunchReadiness } from "@/lib/regions/country-launch-checklist";

/**
 * GET /api/admin/regions/[regionId]/launch-checklist
 * The path segment is the tenant id. The folder shares the [regionId] name with
 * online-gateway so Next can register both routes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ regionId: string }> },
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { regionId: tenantId } = await params;
    const result = await validateCountryLaunchReadiness(tenantId);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to validate country launch readiness");
  }
}
