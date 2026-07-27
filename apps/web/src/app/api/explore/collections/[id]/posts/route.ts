import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";

/**
 * POST /api/explore/collections/[id]/posts
 * Add a post to the collection. Auth required. Body: { post_id }.
 * The post must be in the user's saved posts (explore_saved).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: collection } = await supabaseAdmin
      .from("explore_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", user.id)
      .single();
    if (!collection) {
      return errorResponse("Collection not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const postId = body.post_id;
    if (!postId || typeof postId !== "string") {
      return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: saved } = await supabaseAdmin
      .from("explore_saved")
      .select("post_id")
      .eq("user_id", user.id)
      .eq("post_id", postId)
      .single();
    if (!saved) {
      return errorResponse("Post must be saved first before adding to a collection", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabaseAdmin.from("explore_collection_posts").insert({
      collection_id: collectionId,
      post_id: postId,
    });
    if (error) {
      if (error.code === "23505") {
        return successResponse({ success: true }); // Already in collection
      }
      return handleApiError(error, "Failed to add post to collection");
    }
    return successResponse({ success: true }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to add post to collection");
  }
}

/**
 * DELETE /api/explore/collections/[id]/posts?post_id=
 * Remove a post from the collection. Auth required.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: collection } = await supabaseAdmin
      .from("explore_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", user.id)
      .single();
    if (!collection) {
      return errorResponse("Collection not found", "NOT_FOUND", 404);
    }

    const postId = request.nextUrl.searchParams.get("post_id");
    if (!postId) {
      return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabaseAdmin
      .from("explore_collection_posts")
      .delete()
      .eq("collection_id", collectionId)
      .eq("post_id", postId);
    if (error) return handleApiError(error, "Failed to remove post from collection");
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove post from collection");
  }
}
