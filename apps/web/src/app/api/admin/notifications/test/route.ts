import { NextRequest } from "next/server";
import { z } from "zod";
import { sendToUser, type NotificationChannel } from "@/lib/notifications/onesignal";
import { requireAdminSectionAny, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_MARKETING_COMMS,
} from "@/lib/admin-sections";

const bodySchema = z.object({
  channel: z.enum(["push", "email", "sms"]),
});

/**
 * POST /api/admin/notifications/test
 * Body: { channel: "push" | "email" | "sms" }
 * Sends a OneSignal test to the signed-in admin user (same stack as provider test push).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_MARKETING_COMMS, ADMIN_SECTION_INTEGRATIONS_DEV],
      request
    );

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("channel is required: push | email | sms", "VALIDATION_ERROR", 400);
    }

    const { channel } = parsed.data;
    const channels = [channel] as NotificationChannel[];

    const supabase = await getSupabaseServer(request);
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String((profile as { role?: string } | null)?.role ?? "");
    const appType =
      role === "provider_owner" || role === "provider_staff" ? "provider" : "customer";

    const result = await sendToUser(
      user.id,
      {
        title: "Beautonomi admin test",
        message: "This is a test notification from the admin Notifications page. If you received it, the channel is working.",
        type: "admin_channel_test",
      },
      channels,
      { appType },
    );

    if (!result.success) {
      return errorResponse(result.error || result.message || "Failed to send test notification", "SEND_FAILED", 502);
    }

    return successResponse({ sent: true, notification_id: result.notification_id ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to send test notification");
  }
}
