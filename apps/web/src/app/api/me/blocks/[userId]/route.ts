import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/me/blocks/[userId] — unblock a user
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { userId: blockedUserId } = await params;

    if (!blockedUserId?.trim()) {
      return errorResponse("userId is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_user_id", blockedUserId)
      .select("id")
      .maybeSingle();

    if (error) return handleApiError(error, "Failed to unblock user");
    if (!data) {
      return errorResponse("Block not found", "NOT_FOUND", 404);
    }

    return successResponse({ unblocked: true, user_id: blockedUserId });
  } catch (error) {
    return handleApiError(error, "Failed to unblock user");
  }
}
