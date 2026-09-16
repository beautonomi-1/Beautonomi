import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  requireRoleInApi,
  getEffectiveAdminSectionRoles,
} from "@/lib/supabase/api-helpers";
import { runAdminCopilot } from "@/lib/agents/copilot/run-copilot";
import { canAccessSection } from "@beautonomi/admin-access";
import type { AdminSection } from "@beautonomi/admin-access";
import {
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_USERS_TRUST,
  ALL_ADMIN_ROLES,
} from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const ALL_SECTIONS: AdminSection[] = [
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
];

function effectiveAllowedSections(
  role: UserRole,
  effectiveRoles: Awaited<ReturnType<typeof getEffectiveAdminSectionRoles>>,
): AdminSection[] {
  return ALL_SECTIONS.filter((s) => canAccessSection(role, s, effectiveRoles));
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const effectiveRoles = await getEffectiveAdminSectionRoles(request);
    const allowedSections = effectiveAllowedSections(user.role as UserRole, effectiveRoles);
    if (allowedSections.length === 0) {
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
      allowedSections,
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error as Error, "Copilot failed");
  }
}
