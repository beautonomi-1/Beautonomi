import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json().catch(() => ({}));

    // Only read-state may be patched from the client. Keep is_read and read_at
    // coupled so every surface (web badge uses is_read, mobile rows check
    // read_at) agrees on the read state.
    if (typeof body?.is_read !== "boolean") {
      return errorResponse("Only is_read can be updated", "validation_error", 400);
    }
    const update = body.is_read
      ? { is_read: true, read_at: new Date().toISOString() }
      : { is_read: false, read_at: null };

    const { error } = await supabase
      .from("notifications")
      .update(update)
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
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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
