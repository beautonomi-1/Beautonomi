import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: userId } = await params;
    const body = await request.json();

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const sendNotification = body.send_notification !== false;

    if (!reason) {
      return errorResponse("reason is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, full_name, email, role, preferred_home_tenant_id")
      .eq("id", userId)
      .single();

    if (userError || !targetUser) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    if ((targetUser as { preferred_home_tenant_id?: string }).preferred_home_tenant_id !== tenantId) {
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

    // Record the warning as an internal admin note
    try {
      await supabase.from("admin_audit_log").insert({
        admin_id: admin.id,
        action: "user_warning_issued",
        target_type: "user",
        target_id: userId,
        metadata: { reason, send_notification: sendNotification },
        tenant_id: tenantId,
      });
    } catch {
      // audit log is best-effort
    }

    return successResponse({
      user_id: userId,
      warning_reason: reason,
      notification_sent: sendNotification,
    });
  } catch (error) {
    return handleApiError(error, "Failed to issue warning");
  }
}
