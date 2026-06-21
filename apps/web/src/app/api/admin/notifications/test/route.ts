import { NextRequest } from "next/server";
import { z } from "zod";
import { sendToUser, type NotificationChannel } from "@/lib/notifications/onesignal";
import { requireAdminSectionAny, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_MARKETING_COMMS,
} from "@/lib/admin-sections";
import { sendQueuedWhatsApp, type QueuedNotificationRow } from "@/lib/notifications/queued-senders";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const bodySchema = z.object({
  channel: z.enum(["push", "email", "sms", "whatsapp"]),
});

/**
 * POST /api/admin/notifications/test
 * Body: { channel: "push" | "email" | "sms" | "whatsapp" }
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
      return errorResponse("channel is required: push | email | sms | whatsapp", "VALIDATION_ERROR", 400);
    }

    const { channel } = parsed.data;

    if (channel === "whatsapp") {
      const tenantId = await resolveAdminApiTenantId(request);
      const supabase = getSupabaseAdmin();
      const { data: userRow } = await supabase
        .from("users")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle();

      const phone = (userRow as { phone?: string | null } | null)?.phone?.trim();
      if (!phone) {
        return errorResponse(
          "Add a phone number to your admin user profile to test WhatsApp.",
          "VALIDATION_ERROR",
          400,
        );
      }

      let contentSid: string | undefined;
      try {
        const { data: settingsRow } = await supabase
          .from("platform_settings")
          .select("settings")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const tw = (settingsRow?.settings as Record<string, unknown> | undefined)?.twilio as
          | Record<string, unknown>
          | undefined;
        if (typeof tw?.content_sid === "string" && tw.content_sid.startsWith("HX")) {
          contentSid = tw.content_sid;
        }
      } catch {
        // optional
      }

      const testRow: QueuedNotificationRow = {
        id: `admin-test-${Date.now()}`,
        channel: "whatsapp",
        template_key: "admin_channel_test",
        payload: {
          to: phone,
          body: "Beautonomi admin WhatsApp test — if you received this, the channel is working.",
          category: "utility",
          template_status: contentSid ? "approved" : "unknown",
          content_sid: contentSid,
          content_variables: contentSid ? { "1": "Admin" } : undefined,
          _queue_meta: { tenant_id: tenantId ?? "" },
        },
        attempts: 0,
        max_attempts: 1,
        recipient_user_id: user.id,
        booking_id: null,
        notification_id: null,
      };

      await sendQueuedWhatsApp(testRow);
      return successResponse({ sent: true, channel: "whatsapp" });
    }

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
