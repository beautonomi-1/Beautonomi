import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";

/**
 * PATCH /api/admin/notifications/[id]
 * Set read/unread for the caller's own notification row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const { id } = await params;
    const body = (await request.json()) as { is_read?: boolean };
    const supabase = getSupabaseAdmin();

    const isRead = body.is_read === true;
    const { data, error } = await supabase
      .from("notifications")
      .update({
        is_read: isRead,
        read_at: isRead ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Notification not found");

    const n = data as Record<string, unknown>;
    return successResponse({
      notification: {
        ...data,
        read: n.is_read,
        timestamp: n.created_at,
        link: n.link ?? n.action_url ?? undefined,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to update notification");
  }
}

/**
 * DELETE /api/admin/notifications/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) return notFoundResponse("Notification not found");

    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete notification");
  }
}
