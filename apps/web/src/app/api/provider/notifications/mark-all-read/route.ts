import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";
import { getUnreadNotificationCount } from "@/lib/notifications/insert-notification";
import { syncPushBadgeCountAllAppsImmediate } from "@/lib/notifications/sync-push-badge-count";

/**
 * POST /api/provider/notifications/mark-all-read
 *
 * Mark all provider notifications as read
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Mark all as read
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      throw error;
    }

    invalidateProviderNotificationsListCache(user.id);
    const totalUnread = await getUnreadNotificationCount(user.id);
    void syncPushBadgeCountAllAppsImmediate(user.id);

    return successResponse({ message: "All notifications marked as read", total_unread: totalUnread });
  } catch (error) {
    return handleApiError(error, "Failed to mark all notifications as read");
  }
}
