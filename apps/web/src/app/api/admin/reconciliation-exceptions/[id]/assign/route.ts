import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const bodySchema = z.object({
  /** null clears the assignment */
  assigned_to: z.string().uuid().nullable(),
});

/**
 * POST /api/admin/reconciliation-exceptions/[id]/assign
 * Assign (or unassign) an open reconciliation exception to an admin user.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("assigned_to must be a user id or null", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("reconciliation_exceptions")
      .select("id, tenant_id, status, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (!row) return errorResponse("Exception not found", "NOT_FOUND", 404);
    if (String((row as { tenant_id: string }).tenant_id) !== tenantId) {
      return errorResponse("Exception not in admin tenant scope", "FORBIDDEN", 403);
    }
    if ((row as { status: string }).status !== "open") {
      return errorResponse("Only open exceptions can be assigned", "INVALID_STATE", 409);
    }

    const assignedTo = parsed.data.assigned_to;
    if (assignedTo) {
      const { data: assignee } = await supabase
        .from("users")
        .select("id, role, deactivated_at")
        .eq("id", assignedTo)
        .maybeSingle();
      const assigneeRow = assignee as { role?: string; deactivated_at?: string | null } | null;
      if (
        !assigneeRow ||
        assigneeRow.deactivated_at ||
        !(ALL_ADMIN_ROLES as readonly string[]).includes(String(assigneeRow.role))
      ) {
        return errorResponse("Assignee must be an active admin user", "VALIDATION_ERROR", 400);
      }
    }

    const { data: updated, error } = await supabase
      .from("reconciliation_exceptions")
      .update({
        assigned_to: assignedTo,
        assigned_at: assignedTo ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select("id, status, assigned_to, assigned_at")
      .single();
    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.reconciliation_exception.assign",
      entity_type: "reconciliation_exception",
      entity_id: id,
      module: "finance",
      risk_level: "medium",
      retention_tier: "financial",
      status: "succeeded",
      before_json: { assigned_to: (row as { assigned_to?: string | null }).assigned_to ?? null },
      after_json: { assigned_to: assignedTo },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error as Error, "Failed to assign reconciliation exception");
  }
}
