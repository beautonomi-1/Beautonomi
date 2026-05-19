import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { sendToUser } from "@/lib/notifications/onesignal";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    await sendToUser(
      user.id,
      {
        title: "Test Notification",
        message:
          "This is a test notification from Beautonomi. If you see this, your notifications are working!",
        type: "test_notification",
      },
      ["push"],
      { appType: "provider" }
    );

    return successResponse({ sent: true });
  } catch (error) {
    return handleApiError(error, "Failed to send test notification");
  }
}
