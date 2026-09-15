import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getEffectiveAdminSectionRoles } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { canAccessSection } from "@beautonomi/admin-access";
import type { UserRole } from "@/types/beautonomi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { listPolicedActionTypes, getAgentApprovalPolicy } from "@/lib/agents/actions/approval-policy";

function allowedActionTypesForRole(
  role: UserRole,
  effectiveRoles: Awaited<ReturnType<typeof getEffectiveAdminSectionRoles>>,
): string[] {
  const types: string[] = [];
  for (const actionType of listPolicedActionTypes()) {
    const policy = getAgentApprovalPolicy(actionType);
    if (policy && canAccessSection(role, policy.section, effectiveRoles)) {
      types.push(actionType);
    }
  }
  return types;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("agent_actions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    const role = user.role as UserRole;
    if (role !== "superadmin") {
      const effectiveRoles = await getEffectiveAdminSectionRoles(request);
      const allowedTypes = allowedActionTypesForRole(role, effectiveRoles);
      if (allowedTypes.length === 0) return successResponse([]);
      q = q.in("action_type", allowedTypes);
    }

    if (status) q = q.eq("status", status);
    if (agentId) q = q.eq("agent_id", agentId);
    const { data, error } = await q;
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list agent actions");
  }
}
