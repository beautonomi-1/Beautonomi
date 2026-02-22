import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";
import type { ExplorePost, ExplorePostsCursorResponse } from "@/types/explore";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

/**
 * GET /api/explore/saved
 * List saved posts (cursor pagination). Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const cursorEncoded = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    let cursorPublishedAt: string | null = null;
    let cursorId: string | null = null;
    if (cursorEncoded) {
      try {
        const cursor = JSON.parse(
          Buffer.from(cursorEncoded, "base64url").toString()
        ) as { published_at: string; id: string };
        cursorPublishedAt = cursor.published_at;
        cursorId = cursor.id;
      } catch {
        return errorResponse("Invalid cursor", "BAD_REQUEST", 400);
      }
    }

    const { data: rows, error } = await supabaseAdmin.rpc(
      "explore_saved_list",
      {
        p_user_id: user.id,
        p_cursor_published_at: cursorPublishedAt,
        p_cursor_id: cursorId,
        p_limit: limit + 1,
      }
    );

    if (error) return handleApiError(error, "Failed to fetch saved posts");

    const items = rows || [];
    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    const last = slice[slice.length - 1];

    const likedRes = await supabaseAdmin
      .from("explore_events")
      .select("post_id")
      .eq("actor_type", "authed")
      .eq("actor_key", user.id)
      .eq("event_type", "like")
      .in("post_id", slice.map((r: any) => r.id));
    const likedIds = new Set((likedRes.data || []).map((r: any) => r.post_id));

    const data: ExplorePost[] = slice.map((r: any) => ({
      id: r.id,
      provider_id: r.provider_id,
      provider: r.provider_business_name
        ? { business_name: r.provider_business_name, slug: r.provider_slug }
        : { business_name: "", slug: "" },
      created_by_user_id: r.created_by_user_id,
      caption: r.caption,
      media_urls: (r.media_urls || []).map((p: string) =>
        toPublicMediaUrl(p, process.env.NEXT_PUBLIC_SUPABASE_URL)
      ),
      status: r.status,
      published_at: r.published_at,
      like_count: r.like_count ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_saved: true,
      is_liked: likedIds.has(r.id),
    }));

    let nextCursor: string | undefined;
    if (hasMore && last) {
      nextCursor = Buffer.from(
        JSON.stringify({ published_at: last.published_at, id: last.id })
      ).toString("base64url");
    }

    const response: ExplorePostsCursorResponse = {
      data,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to fetch saved posts");
  }
}

/**
 * POST /api/explore/saved
 * Save a post. Auth required. Body: { post_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const body = await request.json();
    const { post_id } = body;

    if (!post_id) {
      return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabaseAdmin.from("explore_saved").insert({
      user_id: user.id,
      post_id,
    });

    if (error) {
      if (error.code === "23505") {
        return successResponse({ success: true }); // Already saved
      }
      return handleApiError(error, "Failed to save post");
    }

    return successResponse({ success: true }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to save post");
  }
}

/**
 * DELETE /api/explore/saved?post_id=
 * Unsave a post. Auth required.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("post_id");

    if (!postId) {
      return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabaseAdmin
      .from("explore_saved")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", postId);

    if (error) return handleApiError(error, "Failed to unsave post");

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to unsave post");
  }
}
