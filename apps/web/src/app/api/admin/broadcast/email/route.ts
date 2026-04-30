import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { sendToUsers } from "@/lib/notifications/onesignal";
import {
  resolveBroadcastCustomerUserIds,
  resolveBroadcastProviderUserIds,
} from "@/lib/admin/broadcast-recipient-resolution";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/broadcast/email
 * 
 * Send email broadcast to all users, all providers, or a segment
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) throw new Error("Authentication required");
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { subject, message, recipient_type, user_ids, app_type } = body;

    if (!subject || !message) {
      return errorResponse("Subject and message are required", "VALIDATION_ERROR", 400);
    }

    if (!recipient_type || !["all_users", "all_providers", "custom"].includes(recipient_type)) {
      return errorResponse("Invalid recipient_type", "VALIDATION_ERROR", 400);
    }

    if (recipient_type === "custom" && !["customer", "provider"].includes(app_type)) {
      return errorResponse("app_type is required for custom recipients", "VALIDATION_ERROR", 400);
    }

    let userIds: string[] = [];

    // Get user IDs based on recipient type (same fallbacks as push broadcast)
    if (recipient_type === "all_users") {
      const resolved = await resolveBroadcastCustomerUserIds(supabase, tenantId);
      userIds = resolved.userIds;
    } else if (recipient_type === "all_providers") {
      const resolved = await resolveBroadcastProviderUserIds(supabase, tenantId);
      userIds = resolved.userIds;
    } else if (recipient_type === "custom" && user_ids && Array.isArray(user_ids)) {
      userIds = user_ids;
    } else {
      return errorResponse("Invalid recipient configuration", "VALIDATION_ERROR", 400);
    }

    if (userIds.length === 0) {
      return errorResponse("No recipients found", "VALIDATION_ERROR", 400);
    }

    const appType = recipient_type === "all_users" ? "customer" : recipient_type === "all_providers" ? "provider" : app_type;
    const result = await sendToUsers(
      userIds,
      {
        title: subject,
        message: message,
        type: "admin_broadcast",
        data: {
          type: "admin_broadcast",
          recipient_type,
        },
      },
      ["email"],
      {
        ...(appType ? { appType } : {}),
        tenantId,
      }
    );

    if (!result.success) {
      return errorResponse(result.error || "Failed to send broadcast", "BROADCAST_ERROR", 500);
    }

    // Log broadcast
    const { error: logError } = await supabase.from("broadcast_logs").insert({
      sent_by: user.id,
      recipient_type,
      recipient_count: userIds.length,
      channel: "email",
      subject,
      message,
      status: result.success ? "sent" : "failed",
      notification_id: result.notification_id,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error("Error logging broadcast:", logError);
      // Don't fail the request if logging fails
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.broadcast.email",
      entity_type: "broadcast",
      module: "marketing",
      risk_level: "high",
      retention_tier: "routine",
      status: "succeeded",
      metadata: { recipient_type, recipient_count: userIds.length },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      success: true,
      recipients: userIds.length,
      notification_id: result.notification_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send email broadcast");
  }
}
