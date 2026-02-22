import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/notifications
 *
 * Get provider's notifications
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({
        notifications: [],
        total_unread: 0,
      });
    }

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

    // If table doesn't exist or other error, return empty array
    if (error) {
      // Log error but don't throw - return empty notifications
      console.warn('Error fetching notifications:', error);
      return successResponse({
        notifications: [],
        total_unread: 0,
      });
    }

    // Get unread count
    const { count: unreadCount, error: countError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    
    // If count query fails, default to 0
    if (countError) {
      console.warn('Error counting unread notifications:', countError);
    }
    
    // Transform notifications to match frontend expectations (map is_read to read)
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
