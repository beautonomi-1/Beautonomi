import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/me/mutes/[userId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { userId: mutedUserId } = await params;

    if (!mutedUserId?.trim()) {
      return errorResponse("userId is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("user_mutes")
      .delete()
      .eq("muter_id", user.id)
      .eq("muted_user_id", mutedUserId)
      .select("id")
      .maybeSingle();

    if (error) return handleApiError(error, "Failed to unmute user");
    if (!data) {
      return errorResponse("Mute not found", "NOT_FOUND", 404);
    }

    return successResponse({ unmuted: true, user_id: mutedUserId });
  } catch (error) {
    return handleApiError(error, "Failed to unmute user");
  }
}
