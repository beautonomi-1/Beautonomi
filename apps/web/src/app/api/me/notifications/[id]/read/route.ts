import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/notifications/[id]/read
 *
 * Mark a notification as read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer();

    // Verify notification belongs to user
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
      .eq("is_read", false);

    if (updateError) {
      throw updateError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to mark notification as read");
  }
}
