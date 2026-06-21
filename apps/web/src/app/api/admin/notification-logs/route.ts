import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { sendToUsers, type NotificationPayload } from "@/lib/notifications/onesignal";
import { resolveTenantIdForPush } from "@/lib/notifications/resolve-tenant-for-push";
import type { OneSignalAppType } from "@/lib/platform/secrets";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * GET /api/admin/notification-logs
 *
 * Two modes (both gated by Marketing/Comms section, same as notification templates):
 * - `?user_id=<uuid>`  → notification_logs rows where `recipients` contains that user id
 *   (push/email/sms delivery + suppression history for a single account).
 * - `?search=<q>`      → lightweight user picker (id, name, email, role) for the logs tab.
 *
 * notification_logs has no tenant_id/user_id column — `recipients` is a TEXT[] of user UUIDs,
 * so we match with `.contains("recipients", [userId])`.
 */

type NotificationLogRow = {
  id: string;
  event_type: string;
  recipients: string[] | null;
  payload: Record<string, unknown> | null;
  provider_response: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  channels: string[] | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractInvalidAliases(providerResponse: Record<string, unknown> | null): string[] | null {
  if (!providerResponse) return null;
  const warnings = providerResponse.warnings;
  const errors = providerResponse.errors;
  const buckets: unknown[] = [];
  if (Array.isArray(warnings)) buckets.push(...warnings);
  if (Array.isArray(errors)) buckets.push(...errors);
  const out = new Set<string>();
  for (const entry of buckets) {
    const rec = asRecord(entry);
    const invalid = rec ? asRecord(rec.invalid_aliases) : null;
    const externalIds = invalid?.external_id;
    if (Array.isArray(externalIds)) {
      for (const id of externalIds) {
        if (typeof id === "string" && id.trim()) out.add(id.trim());
      }
    }
  }
  return out.size > 0 ? Array.from(out) : null;
}

function diagnoseLog(row: NotificationLogRow): string {
  if (row.status === "sent") return "Delivered to OneSignal";
  if (row.status === "suppressed") {
    const reason = asRecord(row.provider_response)?.reason;
    return `Suppressed${typeof reason === "string" ? `: ${reason}` : ""}`;
  }
  if (row.status === "failed") {
    return `Failed: ${row.error_message || "unknown error"}`;
  }
  return row.status;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const statusFilter = searchParams.get("status")?.trim() || "";

    // ── Mode 1: per-user delivery logs ──────────────────────────────────────
    if (userId) {
      const { page, limit, offset } = getPaginationParams(request);
      let query = admin
        .from("notification_logs")
        .select(
          "id, event_type, recipients, payload, provider_response, status, error_message, channels, created_at",
          { count: "exact" },
        )
        .contains("recipients", [userId])
        .order("created_at", { ascending: false });

      if (statusFilter && ["sent", "failed", "suppressed", "pending"].includes(statusFilter)) {
        query = query.eq("status", statusFilter);
      }

      const { data, error, count } = await query.range(offset, offset + limit - 1);
      if (error) throw error;

      const logs = ((data as NotificationLogRow[] | null) ?? []).map((row) => {
        const payload = asRecord(row.payload);
        const reconcile = asRecord(payload?._reconcile);
        const providerResponse = asRecord(row.provider_response);
        const appType =
          (typeof payload?.app_type === "string" ? payload.app_type : null) ??
          (typeof reconcile?.app_type === "string" ? reconcile.app_type : null);
        const tenantId =
          (typeof payload?.tenant_id === "string" ? payload.tenant_id : null) ??
          (typeof reconcile?.tenant_id === "string" ? reconcile.tenant_id : null);
        const templateKey =
          (payload && typeof payload.template_key === "string" ? payload.template_key : null) ??
          (reconcile && typeof reconcile.template_key === "string" ? reconcile.template_key : null);
        const onesignalId =
          providerResponse && typeof providerResponse.id === "string" ? providerResponse.id : null;

        return {
          id: row.id,
          created_at: row.created_at,
          event_type: row.event_type,
          template_key: templateKey,
          status: row.status,
          diagnosis: diagnoseLog(row),
          error_message: row.error_message,
          channels: row.channels ?? [],
          app_type: appType,
          tenant_id: tenantId,
          onesignal_id: onesignalId,
          invalid_aliases: extractInvalidAliases(providerResponse),
          recipients_count: Array.isArray(row.recipients) ? row.recipients.length : 0,
        };
      });

      // Lightweight per-user delivery summary across the returned window.
      const summary = logs.reduce(
        (acc, l) => {
          if (l.status === "sent") acc.sent += 1;
          else if (l.status === "failed") acc.failed += 1;
          else if (l.status === "suppressed") acc.suppressed += 1;
          return acc;
        },
        { sent: 0, failed: 0, suppressed: 0 },
      );

      return successResponse({
        logs,
        meta: {
          page,
          limit,
          total: count ?? 0,
          has_more: (count ?? 0) > offset + limit,
          summary,
        },
      });
    }

    // ── Mode 2: user picker ─────────────────────────────────────────────────
    let usersQuery = admin
      .from("users")
      .select("id, full_name, email, role, created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    if (search) {
      // Match name, email, or a pasted UUID.
      const escaped = search.replace(/[%,]/g, "");
      usersQuery = usersQuery.or(
        `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,id.eq.${/^[0-9a-f-]{36}$/i.test(search) ? search : "00000000-0000-0000-0000-000000000000"}`,
      );
    }

    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    return successResponse({
      users: (users ?? []).map((u) => ({
        id: (u as { id: string }).id,
        full_name: (u as { full_name?: string | null }).full_name ?? null,
        email: (u as { email?: string | null }).email ?? null,
        role: (u as { role?: string | null }).role ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification logs");
  }
}

/**
 * POST /api/admin/notification-logs
 *
 * One-click "send test push to this user" for end-to-end verification.
 * Body: `{ user_id: string, app_type?: "customer" | "provider" }`.
 *
 * We resolve the tenant from the user (so tenant-scoped OneSignal creds load),
 * then send to whichever OneSignal app(s) the user actually has devices on
 * (falling back to both apps when no device rows exist). Each send is recorded
 * in notification_logs by the OneSignal pipeline, so the new row shows up in the
 * delivery-logs view on refresh.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

    const admin = getSupabaseAdmin();
    const body = (await request.json().catch(() => null)) as
      | { user_id?: unknown; app_type?: unknown }
      | null;
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return errorResponse("A valid user_id is required", "VALIDATION_ERROR", 400);
    }
    const requestedAppType =
      body?.app_type === "customer" || body?.app_type === "provider" ? body.app_type : null;

    const tenantId = await resolveTenantIdForPush(admin, { userId });

    // Figure out which app(s) the user has devices on so the test lands somewhere.
    let appTypes: OneSignalAppType[] = requestedAppType ? [requestedAppType] : [];
    if (appTypes.length === 0) {
      const { data: devices } = await admin
        .from("user_devices")
        .select("app_type")
        .eq("user_id", userId);
      const found = new Set<OneSignalAppType>();
      for (const d of (devices as { app_type?: string | null }[] | null) ?? []) {
        if (d.app_type === "provider") found.add("provider");
        else found.add("customer");
      }
      appTypes = found.size > 0 ? Array.from(found) : ["customer", "provider"];
    }

    const notif: NotificationPayload = {
      title: "Test push ✅",
      message: "This is a test notification from Beautonomi admin.",
      type: "admin_test_push",
      data: { type: "admin_test_push", sent_by: user.id },
    };

    const results: { app_type: OneSignalAppType; success: boolean; message: string }[] = [];
    for (const appType of appTypes) {
      const r = await sendToUsers([userId], notif, ["push"], { appType, tenantId });
      results.push({
        app_type: appType,
        success: Boolean(r.success),
        message: r.error || r.message || (r.success ? "Accepted by OneSignal" : "Failed"),
      });
    }

    const anySuccess = results.some((r) => r.success);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.notification.test_push",
      entity_type: "user",
      entity_id: userId,
      module: "marketing",
      risk_level: "low",
      retention_tier: "routine",
      status: anySuccess ? "succeeded" : "failed",
      metadata: { tenant_id: tenantId, results },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    if (!anySuccess) {
      const detail = results.map((r) => `${r.app_type}: ${r.message}`).join(" · ");
      const notConfigured = detail.includes("OneSignal API keys not configured");
      return errorResponse(
        detail || "Failed to send test push",
        notConfigured ? "ONESIGNAL_NOT_CONFIGURED" : "TEST_PUSH_ERROR",
        notConfigured ? 503 : 500,
      );
    }

    return successResponse({
      success: true,
      results,
      message: `Test push submitted to ${results
        .filter((r) => r.success)
        .map((r) => r.app_type)
        .join(" & ")} app(s).`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send test push");
  }
}
