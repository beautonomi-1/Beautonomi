import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validateCountryLaunchReadiness } from "@/lib/regions/country-launch-checklist";

/**
 * GET /api/admin/regions/[tenantId]/launch-checklist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { tenantId } = await params;
    const result = await validateCountryLaunchReadiness(tenantId);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to validate country launch readiness");
  }
}
