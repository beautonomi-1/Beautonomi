import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getEffectiveAdminSectionRoles } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  allowedActionTypesForRole,
  DECIDED_AGENT_STATUSES,
  PENDING_AGENT_STATUSES,
} from "@/lib/agents/actions/agent-action-list-filters";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");
    const targetType = searchParams.get("target_type");
    const targetId = searchParams.get("target_id");
    const actionType = searchParams.get("action_type");
    const includeDecided = searchParams.get("include_decided") === "true";
    const decidedHours = Math.min(168, Math.max(1, Number(searchParams.get("decided_hours") ?? 24) || 24));
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

    if (status) {
      q = q.eq("status", status);
    } else if (includeDecided) {
      q = q.in("status", [...PENDING_AGENT_STATUSES, ...DECIDED_AGENT_STATUSES]);
    } else {
      q = q.in("status", [...PENDING_AGENT_STATUSES]);
    }

    if (agentId) q = q.eq("agent_id", agentId);
    if (targetType) q = q.eq("target_type", targetType);
    if (targetId) q = q.eq("target_id", targetId);
    if (actionType) q = q.eq("action_type", actionType);

    const { data, error } = await q;
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list agent actions");
  }
}
