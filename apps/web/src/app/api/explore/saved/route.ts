import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import { assertNotBlocked, UserBlockedError } from "@/lib/safety/user-blocks";
import { getViewerSafetyContext } from "@/lib/safety/viewer-safety-context";
import { applyExploreViewerContentFilters } from "@/lib/safety/filter-explore-posts";
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
    const viewerSafety = await getViewerSafetyContext(user.id, request);
    if (viewerSafety.hideSocialFeed) {
      return successResponse({ data: [], next_cursor: undefined, has_more: false });
    }

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

    if (error) {
      const msg = (error as { message?: string }).message || "";
      if (/explore_saved_list|function .* does not exist/i.test(msg)) {
        return errorResponse(
          "Saved posts are temporarily unavailable. If this continues, contact support.",
          "RPC_UNAVAILABLE",
          503,
        );
      }
      return handleApiError(error, "Failed to fetch saved posts");
    }

    const items = rows || [];
    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    const last = slice[slice.length - 1];

    const postIdsSlice = slice.map((r: any) => r.id);
    const [likedRes, collectionLinks] = await Promise.all([
      supabaseAdmin
        .from("explore_events")
        .select("post_id")
        .eq("actor_type", "authed")
        .eq("actor_key", user.id)
        .eq("event_type", "like")
        .in("post_id", postIdsSlice),
      postIdsSlice.length > 0
        ? (async () => {
            const { data: userColls } = await supabaseAdmin
              .from("explore_collections")
              .select("id")
              .eq("user_id", user.id);
            const collIds = (userColls || []).map((c: any) => c.id);
            if (collIds.length === 0) return [] as { post_id: string; collection_id: string }[];
            const { data: links } = await supabaseAdmin
              .from("explore_collection_posts")
              .select("post_id, collection_id")
              .in("collection_id", collIds)
              .in("post_id", postIdsSlice);
            return links || [];
          })()
        : Promise.resolve([]),
    ]);
    const likedIds = new Set((likedRes.data || []).map((r: any) => r.post_id));
    const postToCollectionIds = new Map<string, string[]>();
    for (const link of collectionLinks as { post_id: string; collection_id: string }[]) {
      const arr = postToCollectionIds.get(link.post_id) ?? [];
      arr.push(link.collection_id);
      postToCollectionIds.set(link.post_id, arr);
    }

    const hiddenAuthorIds = new Set([
      ...viewerSafety.blockedUserIds,
      ...viewerSafety.mutedUserIds,
    ]);
    const filteredSlice = applyExploreViewerContentFilters(
      slice,
      {
        hideSocialFeed: viewerSafety.hideSocialFeed,
        sensitiveFilter: viewerSafety.sensitiveContentFilter,
      },
      hiddenAuthorIds,
    );

    const data: (ExplorePost & { collection_ids?: string[] })[] = filteredSlice.map((r: any) => ({
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
      collection_ids: postToCollectionIds.get(r.id) ?? [],
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
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const body = await request.json();
    const { post_id } = body;

    if (!post_id) {
      return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: postRow } = await supabaseAdmin
      .from("explore_posts")
      .select("created_by_user_id")
      .eq("id", post_id)
      .maybeSingle();
    const authorId = (postRow as { created_by_user_id?: string | null } | null)?.created_by_user_id;
    if (authorId) {
      await assertNotBlocked(user.id, authorId, supabaseAdmin);
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
    if (error instanceof UserBlockedError || (error as { code?: string })?.code === "USER_BLOCKED") {
      return errorResponse(
        error instanceof Error ? error.message : "You cannot interact with this user.",
        "USER_BLOCKED",
        403,
      );
    }
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
    await requireSocialAccess(user.id, "like_or_save", request);
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
