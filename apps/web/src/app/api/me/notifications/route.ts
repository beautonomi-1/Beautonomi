import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/notifications
 *
 * Get customer's notifications. Uses admin client so RLS doesn't silently
 * block rows — ownership is enforced via explicit user_id filter.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 30, maxLimit: 100 });
    const unreadOnly = searchParams.get("unread_only") === "true";
    const typeFilter = searchParams.get("type");

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeFilter?.trim()) {
      query = query.eq("type", typeFilter.trim());
    }

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    
    // Transform notifications to match frontend expectations
    const transformedNotifications = (notifications || []).map((n: any) => ({
      ...n,
      read: n.is_read,
      timestamp: n.created_at,
    }));

    return successResponse({
      notifications: transformedNotifications,
      total_unread: unreadCount || 0,
      total: count ?? 0,
      pagination: {
        limit,
        offset,
        has_more: offset + limit < (count ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch notifications");
  }
}
