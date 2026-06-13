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
import { resolveResendCredentials } from "@/lib/integrations/resend";

const broadcastEmailSchema = z
  .object({
    subject: z.string().min(1, "Subject is required"),
    message: z.string().min(1, "Message is required"),
    /** Optional pre-rendered HTML body; when omitted, message is rendered as paragraph text. */
    html: z.string().optional(),
    recipient_type: z.enum(["all_users", "all_providers", "custom"]),
    user_ids: z.array(z.string().uuid()).optional(),
    app_type: z.enum(["customer", "provider"]).optional(),
    /** Optional deep-link recorded into the in-app row for this broadcast. */
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

/** Default HTML wrapper used when caller doesn't supply prerendered HTML. */
function renderBroadcastHtml(subject: string, message: string): string {
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n+/g, "</p><p>");
  return [
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeSubject}</title></head><body style="margin:0;padding:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">`,
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;">`,
    `<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px 0;">${safeSubject}</h1>`,
    `<p style="font-size:16px;line-height:1.55;margin:0;">${safeMessage}</p>`,
    `<hr style="border:none;border-top:1px solid #ececec;margin:24px 0;" />`,
    `<p style="font-size:12px;color:#666;line-height:1.4;margin:0;">You're receiving this because you have a Beautonomi account. Manage your notification preferences in the app.</p>`,
    `</div></body></html>`,
  ].join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * POST /api/admin/broadcast/email
 *
 * §Notifications-audit 2026-05: previously routed via OneSignal's email channel
 * — but Beautonomi never registers email subscriptions on OneSignal (we only
 * push via `OneSignal.login(userId)` for push). That meant most email
 * broadcasts silently delivered to zero recipients.
 *
 * Now: resolves real `users.email` addresses for the audience, then sends one
 * email per recipient via Resend (`RESEND_API_KEY`). On failure we record the
 * specific Resend error in the broadcast log so admins can debug instead of
 * seeing a generic "sent" message.
 *
 * Side effect: writes an in-app notification row (`type='admin_broadcast'`) so
 * the bell shows the same message even for users whose email bounced.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) throw new Error("Authentication required");
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const raw = await request.json();
    const parsed = broadcastEmailSchema.safeParse(raw);
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

    // Resolve emails using the admin client (audience may include users the
    // admin's tenant scope can't see directly via RLS).
    const admin = getSupabaseAdmin();
    const { data: usersWithEmail, error: usersErr } = await admin
      .from("users")
      .select("id, email")
      .in("id", userIds);
    if (usersErr) {
      return handleApiError(usersErr, "Failed to resolve recipient emails");
    }

    type UserRow = { id: string; email?: string | null };
    const recipients = ((usersWithEmail ?? []) as UserRow[])
      .map((u) => ({ id: u.id, email: typeof u.email === "string" ? u.email.trim() : "" }))
      .filter((r) => r.email.length > 0);
    if (recipients.length === 0) {
      return errorResponse(
        "No recipients have an email address on file",
        "NO_DELIVERABLE_RECIPIENTS",
        400,
      );
    }

    const resendCreds = await resolveResendCredentials(admin, tenantId);
    if (!resendCreds?.apiKey) {
      return errorResponse(
        "Email provider not configured (Resend API key missing — set in Admin → Integrations → Resend or RESEND_API_KEY)",
        "EMAIL_PROVIDER_NOT_CONFIGURED",
        503,
      );
    }
    const apiKey = resendCreds.apiKey;
    const fromAddress = resendCreds.fromAddress;

    const subject = b.subject.trim();
    const text = b.message.trim();
    const html = b.html?.trim() ? b.html.trim() : renderBroadcastHtml(subject, text);

    let delivered = 0;
    const failures: { user_id: string; email: string; error: string }[] = [];

    // Sequential to keep the request size predictable and Resend rate happy.
    // For audiences > a few hundred we'd switch to enqueueNotification + cron.
    for (const r of recipients) {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: r.email,
            subject,
            html,
            text,
            headers: {
              "X-Beautonomi-Broadcast": "admin_broadcast",
              "X-Beautonomi-Recipient-Type": b.recipient_type,
            },
          }),
        });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          failures.push({
            user_id: r.id,
            email: r.email,
            error: `${resp.status} ${detail.slice(0, 200)}`,
          });
        } else {
          delivered += 1;
        }
      } catch (err) {
        failures.push({
          user_id: r.id,
          email: r.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Always write in-app rows for delivered recipients so the bell stays in
    // sync — email bounces still leave the user with a record they can review.
    try {
      const { insertNotifications } = await import("@/lib/notifications/insert-notification");
      const trimmedUrl = b.url?.trim() || undefined;
      await insertNotifications(
        recipients.map((r) => ({
          user_id: r.id,
          type: "admin_broadcast",
          title: subject,
          message: text,
          data: {
            type: "admin_broadcast",
            channel: "email",
            recipient_type: b.recipient_type,
            ...(trimmedUrl ? { url: trimmedUrl, deep_link: trimmedUrl } : {}),
          },
          link: trimmedUrl,
        })),
      );
    } catch (e) {
      console.warn("[broadcast email] in-app notification insert skipped:", e);
    }

    const allFailed = delivered === 0 && failures.length > 0;
    const status = allFailed ? "failed" : "sent";

    const { error: logError } = await admin.from("broadcast_logs").insert({
      sent_by: user.id,
      recipient_type: b.recipient_type,
      recipient_count: delivered,
      channel: "email",
      subject,
      message: text,
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
      action: "admin.broadcast.email",
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
        `Email provider rejected every send (${failures.length}). First error: ${failures[0]?.error ?? "unknown"}`,
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
          ? `Sent ${delivered} email${delivered === 1 ? "" : "s"} via Resend.`
          : `Sent ${delivered} of ${recipients.length} emails. ${failures.length} failed — check broadcast history for the first error.`,
      first_failure: failures[0] ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send email broadcast");
  }
}
