import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/notifications
 *
 * Get customer's notifications
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const unreadOnly = searchParams.get("unread_only") === "true";

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

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
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch notifications");
  }
}
