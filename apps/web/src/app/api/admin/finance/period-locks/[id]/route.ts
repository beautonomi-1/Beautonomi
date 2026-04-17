import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * DELETE /api/admin/finance/period-locks/[id]
 * Unlock (delete) a financial period lock. Requires superadmin or admin.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const privilegedRoles = ["superadmin", "admin_finance", "admin_platform_config"] as const;
    if (!privilegedRoles.includes(user.role as typeof privilegedRoles[number])) {
      return errorResponse("Only superadmin, admin_finance, or admin_platform_config can unlock financial periods.", "FORBIDDEN", 403);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: existing } = await (supabase.from("financial_period_locks") as any)
      .select("id, period_start, period_end")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!existing) return notFoundResponse("Period lock not found");

    const { error } = await (supabase.from("financial_period_locks") as any)
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "admin",
      action: "finance.period_lock.delete",
      entity_type: "financial_period_locks",
      entity_id: id,
      metadata: {
        period_start: existing.period_start,
        period_end: existing.period_end,
        tenant_id: tenantId,
      },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete period lock");
  }
}
