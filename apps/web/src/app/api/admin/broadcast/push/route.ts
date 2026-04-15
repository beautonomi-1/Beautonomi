import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { sendToUsers } from "@/lib/notifications/onesignal";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  resolveOneSignalCredentials,
  type OneSignalAppType,
} from "@/lib/platform/secrets";

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
    const body = await request.json();

    const { title, message, recipient_type, user_ids, url } = body;

    if (!title || !message) {
      return errorResponse("Title and message are required", "VALIDATION_ERROR", 400);
    }

    if (!recipient_type || !["all_users", "all_providers", "custom"].includes(recipient_type)) {
      return errorResponse("Invalid recipient_type", "VALIDATION_ERROR", 400);
    }

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
    } else if (recipient_type === "custom" && user_ids && Array.isArray(user_ids)) {
      userIds = user_ids;
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
    if (!osCreds.appId || !osCreds.restKey) {
      return errorResponse(
        "Push is not configured for this deployment. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY (or ONESIGNAL_APP_ID_CUSTOMER / _PROVIDER and matching REST keys), or save OneSignal under Platform settings / Superadmin (global or per-market tenant). Expo / NEXT_PUBLIC_* only configure client apps; the API needs REST keys in env or platform_secrets.",
        "ONESIGNAL_NOT_CONFIGURED",
        503
      );
    }

    // Send push broadcast (pass request-scoped supabase so device lookup matches this session / RLS)
    const result = await sendToUsers(
      userIds,
      {
        title: title,
        message: message,
        type: "admin_broadcast",
        url: url,
        data: {
          type: "admin_broadcast",
          recipient_type,
        },
      },
      ["push"],
      {
        appType: oneSignalAppType,
        supabaseClient: supabase,
        tenantId,
      }
    );

    if (!result.success) {
      const detail = result.error || result.message || "Failed to send broadcast";
      const notConfigured =
        typeof detail === "string" && detail.includes("OneSignal API keys not configured");
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
      subject: title,
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
      action: "admin.broadcast.push",
      entity_type: "broadcast",
      module: "marketing",
      risk_level: "high",
      retention_tier: "routine",
      status: "succeeded",
      metadata: { recipient_type, recipient_count: userIds.length, title },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      success: true,
      recipients: userIds.length,
      notification_id: result.notification_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send push broadcast");
  }
}
