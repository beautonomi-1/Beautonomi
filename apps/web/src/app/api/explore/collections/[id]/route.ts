import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import type { ExplorePost } from "@/types/explore";
import { EXPLORE_POST_SELECT_WITH_PROVIDER } from "@/lib/explore/post-select";
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import { enrichExplorePostsWithSoundUrls } from "@/lib/explore/sound-enrich";
import { isExploreEnabled } from "@/lib/explore/explore-feature-gates";
import { getViewerSafetyContext } from "@/lib/safety/viewer-safety-context";
import { filterBlockedExploreAuthors } from "@/lib/safety/filter-explore-posts";

/**
 * GET /api/explore/collections/[id]
 * Get one collection with its posts. Auth required; must own the collection.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isExploreEnabled(null))) {
      return errorResponse("Collection not found", "NOT_FOUND", 404);
    }
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const viewerSafety = await getViewerSafetyContext(user.id, request);
    if (viewerSafety.hideSocialFeed) {
      const { data: collection, error: collError } = await supabaseAdmin
        .from("explore_collections")
        .select("id, user_id, name, slug, created_at, updated_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (collError || !collection) {
        return errorResponse("Collection not found", "NOT_FOUND", 404);
      }
      return successResponse({
        ...collection,
        post_count: 0,
        posts: [],
      });
    }

    const { data: collection, error: collError } = await supabaseAdmin
      .from("explore_collections")
      .select("id, user_id, name, slug, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (collError || !collection) {
      return errorResponse("Collection not found", "NOT_FOUND", 404);
    }

    const { data: linkRows } = await supabaseAdmin
      .from("explore_collection_posts")
      .select("post_id")
      .eq("collection_id", id)
      .order("created_at", { ascending: false });

    const postIds = (linkRows || []).map((r: any) => r.post_id);
    if (postIds.length === 0) {
      return successResponse({
        ...collection,
        post_count: 0,
        posts: [],
      });
    }

    const { data: postRows } = await supabaseAdmin
      .from("explore_posts")
      .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
      .in("id", postIds)
      .eq("status", "published")
      .eq("is_hidden", false);

    const order = postIds;
    const postMap = new Map((postRows || []).map((p: any) => [p.id, p]));
    const offeringIds = [...new Set((postRows || []).map((p: any) => p.offering_id).filter(Boolean))];
    const offeringMap = new Map<string, { id: string; name: string; price?: number; duration_minutes?: number }>();
    if (offeringIds.length > 0) {
      const { data: offData } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .in("id", offeringIds);
      (offData || []).forEach((o: any) =>
        offeringMap.set(o.id, { id: o.id, name: o.title ?? "", price: o.price != null ? Number(o.price) : undefined, duration_minutes: o.duration_minutes ?? undefined })
      );
    }
    const likedRes = await supabaseAdmin
      .from("explore_events")
      .select("post_id")
      .eq("actor_type", "authed")
      .eq("actor_key", user.id)
      .eq("event_type", "like")
      .in("post_id", postIds);
    const likedIds = new Set((likedRes.data || []).map((r: any) => r.post_id));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const mapped: ExplorePost[] = order
      .map((postId) => {
        const row = postMap.get(postId);
        if (!row) return null;
        const offering = row.offering_id ? offeringMap.get(row.offering_id) : null;
        return {
          ...mapExplorePostRow(row, {
            supabaseUrl,
            savedIds: new Set([row.id]),
            likedIds,
            offering: offering ?? null,
          }),
          is_saved: true,
        };
      })
      .filter(Boolean) as ExplorePost[];
    const hiddenAuthorIds = new Set([
      ...viewerSafety.blockedUserIds,
      ...viewerSafety.mutedUserIds,
    ]);
    const filtered = filterBlockedExploreAuthors(mapped, hiddenAuthorIds);
    const posts = await enrichExplorePostsWithSoundUrls(supabaseAdmin, filtered, supabaseUrl);

    return successResponse({
      ...collection,
      post_count: posts.length,
      posts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch collection");
  }
}

/**
 * PATCH /api/explore/collections/[id]
 * Update collection name/slug. Auth required.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: existing } = await supabaseAdmin
      .from("explore_collections")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (!existing) return errorResponse("Collection not found", "NOT_FOUND", 404);

    const body = await request.json();
    const updates: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.slug === "string" && body.slug.trim()) {
      updates.slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }
    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: updated, error } = await supabaseAdmin
      .from("explore_collections")
      .update(updates)
      .eq("id", id)
      .select("id, user_id, name, slug, created_at, updated_at")
      .single();
    if (error) return handleApiError(error, "Failed to update collection");
    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update collection");
  }
}

/**
 * DELETE /api/explore/collections/[id]
 * Delete collection. Auth required.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("explore_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return handleApiError(error, "Failed to delete collection");
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete collection");
  }
}
