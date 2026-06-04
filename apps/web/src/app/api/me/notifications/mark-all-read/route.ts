import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

/**
 * POST /api/me/notifications/mark-all-read
 *
 * Mark all notifications as read for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      throw error;
    }

    void syncPushBadgeCountAllApps(user.id, 0);

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to mark all notifications as read");
  }
}
