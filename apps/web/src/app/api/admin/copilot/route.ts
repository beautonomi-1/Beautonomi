import { NextRequest } from "next/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { runAdminCopilot } from "@/lib/agents/copilot/run-copilot";
import { canAccessSection } from "@beautonomi/admin-access";
import { ADMIN_SECTION_OVERVIEW, ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    if (!canAccessSection(user.role as any, ADMIN_SECTION_OVERVIEW)) {
      return handleApiError(new Error("Forbidden"), "Copilot not available for this role");
    }
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    if (!body.question) {
      return handleApiError(new Error("question required"), "Missing question");
    }

    const result = await runAdminCopilot({
      question: body.question,
      tenantId,
      adminRole: user.role ?? "admin_support",
      adminUserId: user.id,
      allowedSections: [],
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error as Error, "Copilot failed");
  }
}
