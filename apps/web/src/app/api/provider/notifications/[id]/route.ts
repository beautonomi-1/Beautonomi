import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();

    const { error } = await supabase
      .from("notifications")
      .update({ ...body })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    invalidateProviderNotificationsListCache(user.id);
    void syncPushBadgeCountAllApps(user.id);
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update notification");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    invalidateProviderNotificationsListCache(user.id);
    void syncPushBadgeCountAllApps(user.id);
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete notification");
  }
}
