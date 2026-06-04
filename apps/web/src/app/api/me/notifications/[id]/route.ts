import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

/**
 * GET /api/me/notifications/[id]
 *
 * Single notification row for the authenticated user (announcement detail).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Notification not found");

    const n = data as Record<string, unknown>;
    return successResponse({
      notification: {
        ...data,
        read: n.is_read,
        timestamp: n.created_at,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load notification");
  }
}

/**
 * DELETE /api/me/notifications/[id]
 *
 * Remove a notification for the authenticated user (customer or provider role rows).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    void syncPushBadgeCountAllApps(user.id);
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete notification");
  }
}
