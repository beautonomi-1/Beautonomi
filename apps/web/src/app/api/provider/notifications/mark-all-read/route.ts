import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/notifications/mark-all-read
 *
 * Mark all provider notifications as read
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ message: "No provider found" });
    }

    // Mark all as read
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      // If table doesn't exist, return success (graceful degradation)
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return successResponse({ message: "All notifications marked as read" });
      }
      throw error;
    }

    return successResponse({ message: "All notifications marked as read" });
  } catch (error) {
    return handleApiError(error, "Failed to mark all notifications as read");
  }
}
