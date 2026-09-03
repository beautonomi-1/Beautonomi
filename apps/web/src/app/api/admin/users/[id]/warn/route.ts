import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/users/[id]/warn
 * Issue a formal warning to a user (customer or provider). Records it as
 * a notification and inserts an internal admin note.
 * Body: { reason: string, send_notification?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSectionAny(
      [ADMIN_SECTION_USERS_TRUST, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: userId } = await params;
    const body = await request.json();

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const sendNotification = body.send_notification !== false;

    if (!reason) {
      return errorResponse("reason is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const targetUser = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!targetUser) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    if (sendNotification) {
      try {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Warning from Beautonomi",
          body: `You have received a warning: ${reason}. Continued violations may result in account restrictions.`,
          type: "system_warning",
          data: { admin_id: admin.id, reason },
        });
      } catch {
        // Non-fatal if notification insert fails
      }
    }

    // Record the warning in the unified audit log (best-effort; writeAuditLog never throws)
    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "user_warning_issued",
      entity_type: "user",
      entity_id: userId,
      module: "users_trust",
      risk_level: "medium",
      retention_tier: "operational",
      status: "succeeded",
      metadata: { reason, send_notification: sendNotification, tenant_id: tenantId },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      user_id: userId,
      warning_reason: reason,
      notification_sent: sendNotification,
    });
  } catch (error) {
    return handleApiError(error, "Failed to issue warning");
  }
}
