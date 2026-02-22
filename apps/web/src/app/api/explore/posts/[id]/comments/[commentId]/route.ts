import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/explore/posts/[id]/comments/[commentId]
 * Authenticated: delete a comment. Allowed if user is the comment author
 * or is the provider (owner/staff) for the post.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: postId, commentId } = await params;

    const supabaseAdmin = await getSupabaseAdmin();

    const { data: comment, error: commentError } = await supabaseAdmin
      .from("explore_comments")
      .select("id, post_id, user_id")
      .eq("id", commentId)
      .eq("post_id", postId)
      .single();

    if (commentError || !comment) {
      return errorResponse("Comment not found", "NOT_FOUND", 404);
    }

    const isAuthor = comment.user_id === user.id;
    if (!isAuthor) {
      const { data: post } = await supabaseAdmin
        .from("explore_posts")
        .select("provider_id")
        .eq("id", postId)
        .single();
      const providerId = post ? await getProviderIdForUser(user.id) : null;
      const isProvider = post && providerId === post.provider_id;
      if (!isProvider) {
        return errorResponse("Cannot delete this comment", "FORBIDDEN", 403);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("explore_comments")
      .delete()
      .eq("id", commentId);

    if (deleteError) return handleApiError(deleteError, "Failed to delete comment");

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete comment");
  }
}
