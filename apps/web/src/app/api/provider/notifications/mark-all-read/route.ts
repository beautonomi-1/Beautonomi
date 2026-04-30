import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";

/**
 * POST /api/provider/notifications/mark-all-read
 *
 * Mark all provider notifications as read
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = getSupabaseAdmin();

    // Mark all as read
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.warn("Error marking all provider notifications read:", error);
    } else {
      invalidateProviderNotificationsListCache(user.id);
    }

    return successResponse({ message: "All notifications marked as read" });
  } catch (error) {
    return handleApiError(error, "Failed to mark all notifications as read");
  }
}
