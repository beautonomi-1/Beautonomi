import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { sendToUsers, type NotificationPayload } from "@/lib/notifications/onesignal";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  resolveOneSignalCredentials,
  validateOneSignalCredentialPair,
  type OneSignalAppType,
} from "@/lib/platform/secrets";

const broadcastPushBodySchema = z
  .object({
    title: z.string().min(1),
    message: z.string().min(1),
    recipient_type: z.enum(["all_users", "all_providers", "custom"]),
    user_ids: z.array(z.string().uuid()).optional(),
    url: z.string().max(2000).optional(),
    /** OneSignal internal / campaign name (dashboard only) */
    name: z.string().max(128).optional(),
    subtitle: z.string().max(500).optional(),
    image: z.string().max(2000).optional(),
    /** ISO 8601 (UTC). Schedule delivery via OneSignal `send_after`. */
    send_after: z.string().optional(),
    /** 1–10; e.g. 5 = normal, 10 = high (Android) */
    priority: z.number().int().min(1).max(10).optional(),
    ios_interruption_level: z.enum(["passive", "active", "time_sensitive", "critical"]).optional(),
    /** Merged into the push `data` payload (with admin_broadcast). Values should be string-serializable. */
    additional_data: z.record(z.string(), z.unknown()).optional(),
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

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes(column);
}

/**
 * POST /api/admin/broadcast/push
 * 
 * Send push notification broadcast to all users, all providers, or a segment
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) throw new Error("Authentication required");
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const raw = await request.json();
    const parsed = broadcastPushBodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("Invalid request body", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }
    const b = parsed.data;

    if (b.send_after?.trim()) {
      const t = Date.parse(b.send_after);
      if (Number.isNaN(t)) {
        return errorResponse("send_after must be a valid date-time (ISO 8601)", "VALIDATION_ERROR", 400);
      }
      if (t < Date.now() - 30_000) {
        return errorResponse("send_after must be in the future", "VALIDATION_ERROR", 400);
      }
    }
    if (b.image?.trim()) {
      try {
        void new URL(b.image.trim());
      } catch {
        return errorResponse("image must be a valid URL (e.g. https://…)", "VALIDATION_ERROR", 400);
      }
    }

    const recipient_type = b.recipient_type;
    let userIds: string[] = [];

    // Get user IDs based on recipient type
    if (recipient_type === "all_users") {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id")
        .eq("role", "customer")
        .eq("preferred_home_tenant_id", tenantId);
      if (usersError) {
        if (isMissingColumnError(usersError, "preferred_home_tenant_id")) {
          console.warn(
            "[broadcast/push] users.preferred_home_tenant_id missing, falling back to role-only customer targeting"
          );
          const { data: fallbackUsers, error: fallbackUsersError } = await supabase
            .from("users")
            .select("id")
            .eq("role", "customer");
          if (fallbackUsersError) {
            return handleApiError(fallbackUsersError, "Failed to resolve recipients");
          }
          userIds = fallbackUsers?.map((u: { id: string }) => u.id) ?? [];
        } else {
          return handleApiError(usersError, "Failed to resolve recipients");
        }
      } else {
        userIds = users?.map((u: { id: string }) => u.id) ?? [];
      }
    } else if (recipient_type === "all_providers") {
      const { data: providers, error: providerError } = await supabase
        .from("providers")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .not("user_id", "is", null);
      if (providerError) {
        return handleApiError(providerError, "Failed to resolve provider recipients");
      }
      userIds = providers?.map((p: { user_id?: string }) => p.user_id).filter(Boolean) ?? [];
    } else if (recipient_type === "custom" && b.user_ids) {
      userIds = b.user_ids;
    } else {
      return errorResponse("Invalid recipient configuration", "VALIDATION_ERROR", 400);
    }

    if (userIds.length === 0) {
      return errorResponse("No recipients found", "VALIDATION_ERROR", 400);
    }

    const oneSignalAppType: OneSignalAppType | undefined =
      recipient_type === "all_users"
        ? "customer"
        : recipient_type === "all_providers"
          ? "provider"
          : undefined;

    const osCreds = await resolveOneSignalCredentials(oneSignalAppType, { tenantId });
    const validation = validateOneSignalCredentialPair({
      appId: osCreds.appId,
      restKey: osCreds.restKey,
      appType: oneSignalAppType,
    });
    if (validation.ok === false) {
      return errorResponse(
        validation.message,
        validation.code,
        503
      );
    }

    const extraData =
      b.additional_data && typeof b.additional_data === "object" && !Array.isArray(b.additional_data)
        ? (b.additional_data as Record<string, unknown>)
        : {};
    const dataPayload: Record<string, unknown> = {
      type: "admin_broadcast",
      recipient_type,
      ...extraData,
    };

    const notif: NotificationPayload = {
      title: b.title,
      message: b.message,
      type: "admin_broadcast",
      url: b.url?.trim() || undefined,
      data: dataPayload,
    };
    if (b.name?.trim()) notif.name = b.name.trim().slice(0, 128);
    if (b.subtitle?.trim()) notif.subtitle = b.subtitle.trim();
    if (b.image?.trim()) {
      (notif as { image?: string }).image = b.image.trim();
    }
    if (b.send_after?.trim()) notif.send_after = b.send_after.trim();
    if (b.priority != null) notif.priority = b.priority;
    if (b.ios_interruption_level) notif.ios_interruption_level = b.ios_interruption_level;

    // Send push broadcast (pass request-scoped supabase so device lookup matches this session / RLS)
    const result = await sendToUsers(userIds, notif, ["push"], {
      appType: oneSignalAppType,
      supabaseClient: supabase,
      tenantId,
    });

    if (!result.success) {
      const detail = result.error || result.message || "Failed to send broadcast";
      const notConfigured =
        typeof detail === "string" &&
        (detail.includes("OneSignal API keys not configured") ||
          detail.includes("OneSignal REST API key") ||
          detail.includes("OneSignal rejected"));
      return errorResponse(
        detail,
        notConfigured ? "ONESIGNAL_NOT_CONFIGURED" : "BROADCAST_ERROR",
        notConfigured ? 503 : 500
      );
    }

    // Log broadcast
    const { error: logError } = await supabase.from("broadcast_logs").insert({
      sent_by: user.id,
      recipient_type,
      recipient_count: userIds.length,
      channel: "push",
      subject: b.title,
      message: b.message,
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
      action: "admin.broadcast.push",
      entity_type: "broadcast",
      module: "marketing",
      risk_level: "high",
      retention_tier: "routine",
      status: "succeeded",
      metadata: { recipient_type, recipient_count: userIds.length, title: b.title },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    const scheduled = Boolean(b.send_after?.trim());
    return successResponse({
      success: true,
      recipients: userIds.length,
      notification_id: result.notification_id,
      delivery: scheduled ? "scheduled" : "immediate",
      message: scheduled
        ? `Scheduled in OneSignal for ${userIds.length} user account(s). OneSignal will deliver to subscribed devices at the chosen time.`
        : `Submitted to OneSignal for ${userIds.length} user account(s). This is not a Beautonomi job queue — OneSignal delivers to devices, typically within seconds.`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send push broadcast");
  }
}
