import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

/**
 * POST /api/provider/notifications/[id]/read
 *
 * Mark a notification as read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = getSupabaseAdmin();

    // Verify notification belongs to this user (ownership check)
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("id, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !notification) {
      return notFoundResponse("Notification not found");
    }

    // Mark as read
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      throw updateError;
    }

    invalidateProviderNotificationsListCache(user.id);
    void syncPushBadgeCountAllApps(user.id);

    return successResponse({ message: "Notification marked as read" });
  } catch (error) {
    return handleApiError(error, "Failed to mark notification as read");
  }
}
