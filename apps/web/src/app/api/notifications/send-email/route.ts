import { NextRequest } from "next/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { sendToUser, sendTemplateNotification } from "@/lib/notifications/onesignal";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/notifications/send-email
 * 
 * Send email notification via OneSignal
 * Supports both direct email sending and template-based sending
 * Requires superadmin or provider_owner role
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "provider_owner"], request);
    const body = await request.json();
    const { to, subject, body: emailBody, type, templateKey, variables, userId } = body;

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
      // Get user ID from email if not provided
      let targetUserId = userId;
      if (!targetUserId && to) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("email", to)
          .single();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        return handleApiError(
          new Error("User not found for email"),
          "User not found for email",
          "USER_NOT_FOUND",
          404
        );
      }

      // Use template-based notification
      const result = await sendTemplateNotification(
        templateKey,
        [targetUserId],
        variables || {},
        ["email"]
      );

      if (!result.success) {
        return handleApiError(
          new Error(result.error || "Failed to send email"),
          result.error || "Failed to send email",
          "SEND_ERROR",
          500
        );
      }

      return successResponse({
        message: "Email notification sent",
        notification_id: result.notification_id,
      });
    }

    // Direct email sending (fallback if no template)
    if (!subject || !emailBody) {
      return handleApiError(
        new Error("subject and body are required when not using template"),
        "subject and body are required when not using template",
        "VALIDATION_ERROR",
        400
      );
    }

    // Get user ID from email if not provided
    let targetUserId = userId;
    if (!targetUserId && to) {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", to)
        .single();
      targetUserId = user?.id;
    }

    if (!targetUserId) {
      // If user not found, we can still send via OneSignal using email as external user ID
      // But OneSignal requires external user IDs to be registered
      console.warn(`User not found for email ${to}, attempting direct email send`);
    }

    // Send via OneSignal
    const result = targetUserId
      ? await sendToUser(
          targetUserId,
          {
            title: subject,
            message: emailBody,
            type: type || "email",
          },
          ["email"]
        )
      : {
          success: false,
          error: "User ID required for OneSignal email sending",
        };

    if (!result.success) {
      return handleApiError(
        new Error(result.error || "Failed to send email"),
        result.error || "Failed to send email",
        "SEND_ERROR",
        500
      );
    }

    return successResponse({
      message: "Email notification sent",
      notification_id: result.notification_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send email");
  }
}
