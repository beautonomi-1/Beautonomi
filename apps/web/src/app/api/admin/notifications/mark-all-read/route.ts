import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { getUnreadNotificationCount } from "@/lib/notifications/insert-notification";

/**
 * POST /api/admin/notifications/mark-all-read
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) throw error;

    const totalUnread = await getUnreadNotificationCount(user.id);
    return successResponse({ success: true, total_unread: totalUnread });
  } catch (error) {
    return handleApiError(error, "Failed to mark all notifications as read");
  }
}
