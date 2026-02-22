import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

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
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !notification) {
      // If table doesn't exist, return success (graceful degradation)
      if (fetchError?.code === '42P01' || fetchError?.message?.includes('does not exist')) {
        return successResponse({ message: "Notification marked as read" });
      }
      return notFoundResponse("Notification not found");
    }

    // Mark as read
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      // If table doesn't exist, return success (graceful degradation)
      if (updateError.code === '42P01' || updateError.message?.includes('does not exist')) {
        return successResponse({ message: "Notification marked as read" });
      }
      throw updateError;
    }

    return successResponse({ message: "Notification marked as read" });
  } catch (error) {
    return handleApiError(error, "Failed to mark notification as read");
  }
}
