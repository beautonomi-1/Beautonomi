import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";

/**
 * GET /api/admin/notifications
 *
 * Admin staff in-app notification inbox (persisted rows in `notifications`).
 * Always scoped to the authenticated admin user's own rows.
 *
 * Query params:
 * - counts_only=1 — unread head count only
 * - limit, offset — pagination (default limit 20, max 100)
 * - unread_only=true — filter unread
 * - type=<notification_type> — optional type filter
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("counts_only") === "1") {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
      return successResponse({
        notifications: [],
        total_unread: count ?? 0,
      });
    }

    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const unreadOnly = searchParams.get("unread_only") === "true";
    const typeFilter = searchParams.get("type")?.trim();

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) query = query.eq("is_read", false);
    if (typeFilter) query = query.eq("type", typeFilter);

    const { data: rows, error, count: total } = await query;
    if (error) throw error;

    const { count: unreadCount, error: unreadErr } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (unreadErr) throw unreadErr;

    const notifications = (rows ?? []).map((n: Record<string, unknown>) => ({
      ...n,
      read: n.is_read,
      timestamp: n.created_at,
      link: n.link ?? n.action_url ?? undefined,
    }));

    return successResponse({
      notifications,
      total: total ?? notifications.length,
      total_unread: unreadCount ?? 0,
      offset,
      limit,
      has_more: typeof total === "number" ? offset + notifications.length < total : false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch admin notifications");
  }
}
