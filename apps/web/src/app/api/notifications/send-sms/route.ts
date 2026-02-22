import { NextRequest } from "next/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { sendToUser, sendTemplateNotification } from "@/lib/notifications/onesignal";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/notifications/send-sms
 * 
 * Send SMS notification via OneSignal
 * Supports both direct SMS sending and template-based sending
 * Requires superadmin or provider_owner role
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "provider_owner"], request);
    const body = await request.json();
    const { to, message, type, templateKey, variables, userId } = body;

    // Validate required fields
    if (!to && !userId) {
      return handleApiError(
        new Error("to or userId is required"),
        "to or userId is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseServer();

    // If template key is provided, use template-based sending
    if (templateKey) {
      // Get user ID from phone if not provided
      let targetUserId = userId;
      if (!targetUserId && to) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("phone", to)
          .single();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        return handleApiError(
          new Error("User not found for phone"),
          "User not found for phone",
          "USER_NOT_FOUND",
          404
        );
      }

      // Use template-based notification
      const result = await sendTemplateNotification(
        templateKey,
        [targetUserId],
        variables || {},
        ["sms"]
      );

      if (!result.success) {
        return handleApiError(
          new Error(result.error || "Failed to send SMS"),
          result.error || "Failed to send SMS",
          "SEND_ERROR",
          500
        );
      }

      return successResponse({
        message: "SMS notification sent",
        notification_id: result.notification_id,
      });
    }

    // Direct SMS sending (fallback if no template)
    if (!message) {
      return handleApiError(
        new Error("message is required when not using template"),
        "message is required when not using template",
        "VALIDATION_ERROR",
        400
      );
    }

    // Get user ID from phone if not provided
    let targetUserId = userId;
    if (!targetUserId && to) {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("phone", to)
        .single();
      targetUserId = user?.id;
    }

    if (!targetUserId) {
      return handleApiError(
        new Error("User not found for phone number"),
        "User not found for phone number",
        "USER_NOT_FOUND",
        404
      );
    }

    // Send via OneSignal
    const result = await sendToUser(
      targetUserId,
      {
        title: "Beautonomi",
        message: message,
        type: type || "sms",
      },
      ["sms"]
    );

    if (!result.success) {
      return handleApiError(
        new Error(result.error || "Failed to send SMS"),
        result.error || "Failed to send SMS",
        "SEND_ERROR",
        500
      );
    }

    return successResponse({
      message: "SMS notification sent",
      notification_id: result.notification_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send SMS");
  }
}
