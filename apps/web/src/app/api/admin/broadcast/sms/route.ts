import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  resolveBroadcastCustomerUserIds,
  resolveBroadcastProviderUserIds,
} from "@/lib/admin/broadcast-recipient-resolution";

const broadcastSmsSchema = z
  .object({
    message: z.string().min(1, "Message is required").max(1600),
    recipient_type: z.enum(["all_users", "all_providers", "custom"]),
    user_ids: z.array(z.string().uuid()).optional(),
    app_type: z.enum(["customer", "provider"]).optional(),
    /** Optional deep-link recorded into the in-app row. */
    url: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.recipient_type === "custom" && (!val.user_ids || val.user_ids.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "user_ids is required when recipient_type is custom",
        path: ["user_ids"],
      });
    }
  });

/**
 * POST /api/admin/broadcast/sms
 *
 * §Notifications-audit 2026-05: previously routed via OneSignal SMS — but
 * Beautonomi never registers SMS subscriptions on OneSignal. That meant SMS
 * broadcasts silently delivered to zero recipients.
 *
 * Now: resolves real `users.phone` values for the audience and sends one SMS
 * per recipient via Twilio. Per-recipient errors are logged and returned in
 * the response so admins can see the real failure reason.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) throw new Error("Authentication required");
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const raw = await request.json();
    const parsed = broadcastSmsSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("Invalid request body", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }
    const b = parsed.data;

    let userIds: string[] = [];
    if (b.recipient_type === "all_users") {
      const resolved = await resolveBroadcastCustomerUserIds(supabase, tenantId);
      userIds = resolved.userIds;
    } else if (b.recipient_type === "all_providers") {
      const resolved = await resolveBroadcastProviderUserIds(supabase, tenantId);
      userIds = resolved.userIds;
    } else if (b.recipient_type === "custom" && b.user_ids) {
      userIds = b.user_ids;
    }

    if (userIds.length === 0) {
      return errorResponse("No recipients found", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: usersWithPhone, error: usersErr } = await admin
      .from("users")
      .select("id, phone")
      .in("id", userIds);
    if (usersErr) {
      return handleApiError(usersErr, "Failed to resolve recipient phones");
    }

    type UserRow = { id: string; phone?: string | null };
    const recipients = ((usersWithPhone ?? []) as UserRow[])
      .map((u) => ({ id: u.id, phone: typeof u.phone === "string" ? u.phone.trim() : "" }))
      .filter((r) => /^\+?[0-9]{6,16}$/.test(r.phone));
    if (recipients.length === 0) {
      return errorResponse(
        "No recipients have a valid phone number on file",
        "NO_DELIVERABLE_RECIPIENTS",
        400,
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
    const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() || "";
    if (!accountSid || !authToken || !fromNumber) {
      return errorResponse(
        "SMS provider not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required)",
        "SMS_PROVIDER_NOT_CONFIGURED",
        503,
      );
    }

    const message = b.message.trim();
    const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    let delivered = 0;
    const failures: { user_id: string; phone: string; error: string }[] = [];

    for (const r of recipients) {
      try {
        const form = new URLSearchParams();
        form.set("To", r.phone);
        form.set("From", fromNumber);
        form.set("Body", message);
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: auth,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form,
          },
        );
        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          failures.push({
            user_id: r.id,
            phone: r.phone,
            error: `${resp.status} ${detail.slice(0, 200)}`,
          });
        } else {
          delivered += 1;
        }
      } catch (err) {
        failures.push({
          user_id: r.id,
          phone: r.phone,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Mirror to in-app inbox so users with a bad phone still get the message.
    try {
      const { insertNotifications } = await import("@/lib/notifications/insert-notification");
      const trimmedUrl = b.url?.trim() || undefined;
      await insertNotifications(
        recipients.map((r) => ({
          user_id: r.id,
          type: "admin_broadcast",
          title: "Beautonomi",
          message,
          data: {
            type: "admin_broadcast",
            channel: "sms",
            recipient_type: b.recipient_type,
            ...(trimmedUrl ? { url: trimmedUrl, deep_link: trimmedUrl } : {}),
          },
          link: trimmedUrl,
        })),
      );
    } catch (e) {
      console.warn("[broadcast sms] in-app notification insert skipped:", e);
    }

    const allFailed = delivered === 0 && failures.length > 0;
    const status = allFailed ? "failed" : "sent";

    const { error: logError } = await admin.from("broadcast_logs").insert({
      sent_by: user.id,
      recipient_type: b.recipient_type,
      recipient_count: delivered,
      channel: "sms",
      message,
      status,
      created_at: new Date().toISOString(),
    });
    if (logError) {
      console.error("Error logging broadcast:", logError);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.broadcast.sms",
      entity_type: "broadcast",
      module: "marketing",
      risk_level: "high",
      retention_tier: "routine",
      status: allFailed ? "failed" : "succeeded",
      metadata: {
        recipient_type: b.recipient_type,
        intended: recipients.length,
        delivered,
        failures: failures.length,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    if (allFailed) {
      return errorResponse(
        `Twilio rejected every send (${failures.length}). First error: ${failures[0]?.error ?? "unknown"}`,
        "BROADCAST_FAILED",
        502,
      );
    }

    return successResponse({
      success: true,
      recipients: delivered,
      intended: recipients.length,
      failures: failures.length,
      message:
        failures.length === 0
          ? `Sent ${delivered} SMS via Twilio.`
          : `Sent ${delivered} of ${recipients.length} SMS. ${failures.length} failed — check broadcast history for the first error.`,
      first_failure: failures[0] ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send SMS broadcast");
  }
}
