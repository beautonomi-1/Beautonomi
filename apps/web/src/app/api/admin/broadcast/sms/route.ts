import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { sendToUsers } from "@/lib/notifications/onesignal";

/**
 * POST /api/admin/broadcast/sms
 * 
 * Send SMS broadcast to all users, all providers, or a segment
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRoleInApi(['superadmin'], request);
    if (!auth) throw new Error("Authentication required");
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { message, recipient_type, user_ids } = body;

    if (!message) {
      return errorResponse("Message is required", "VALIDATION_ERROR", 400);
    }

    if (!recipient_type || !["all_users", "all_providers", "custom"].includes(recipient_type)) {
      return errorResponse("Invalid recipient_type", "VALIDATION_ERROR", 400);
    }

    let userIds: string[] = [];

    // Get user IDs based on recipient type
    if (recipient_type === "all_users") {
      const { data: users } = await supabase
        .from("users")
        .select("id")
        .eq("role", "customer");
      userIds = users?.map((u: any) => u.id) || [];
    } else if (recipient_type === "all_providers") {
      const { data: providers } = await supabase
        .from("providers")
        .select("user_id")
        .not("user_id", "is", null);
      userIds = providers?.map((p: any) => p.user_id).filter(Boolean) || [];
    } else if (recipient_type === "custom" && user_ids && Array.isArray(user_ids)) {
      userIds = user_ids;
    } else {
      return errorResponse("Invalid recipient configuration", "VALIDATION_ERROR", 400);
    }

    if (userIds.length === 0) {
      return errorResponse("No recipients found", "VALIDATION_ERROR", 400);
    }

    // Send SMS broadcast
    const result = await sendToUsers(
      userIds,
      {
        title: "Beautonomi",
        message: message,
        type: "admin_broadcast",
        data: {
          type: "admin_broadcast",
          recipient_type,
        },
      },
      ["sms"]
    );

    if (!result.success) {
      return errorResponse(result.error || "Failed to send broadcast", "BROADCAST_ERROR", 500);
    }

    // Log broadcast
    const { error: logError } = await supabase.from("broadcast_logs").insert({
      sent_by: auth.user.id,
      recipient_type,
      recipient_count: userIds.length,
      channel: "sms",
      message,
      status: result.success ? "sent" : "failed",
      notification_id: result.notification_id,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error("Error logging broadcast:", logError);
      // Don't fail the request if logging fails
    }

    return successResponse({
      success: true,
      recipients: userIds.length,
      notification_id: result.notification_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send SMS broadcast");
  }
}
