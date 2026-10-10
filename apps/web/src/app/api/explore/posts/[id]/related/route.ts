import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { fetchRelatedPosts } from "@/lib/explore/fetch-posts";
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import { enrichExplorePostsWithSoundUrls } from "@/lib/explore/sound-enrich";
import { isExploreEnabled } from "@/lib/explore/explore-feature-gates";
import { getViewerSafetyContext } from "@/lib/safety/viewer-safety-context";
import { applyExploreViewerContentFilters, postHasSensitiveContent } from "@/lib/safety/filter-explore-posts";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * GET /api/explore/posts/[id]/related
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isExploreEnabled(null))) {
      return successResponse({ data: [] });
    }
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const viewerSafety = await getViewerSafetyContext(user?.id, request);
    if (viewerSafety.hideSocialFeed) {
      return successResponse({ data: [] });
    }

    const { data: row } = await supabaseAdmin
      .from("explore_posts")
      .select("id, status, is_hidden, created_by_user_id, caption, tags")
      .eq("id", id)
      .maybeSingle();

    if (!row || row.status !== "published" || row.is_hidden) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }
    if (viewerSafety.sensitiveContentFilter && postHasSensitiveContent(row)) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const related = await fetchRelatedPosts(id, 12);
    const hiddenIds = new Set([...viewerSafety.blockedUserIds, ...viewerSafety.mutedUserIds]);
    const filtered = applyExploreViewerContentFilters(related, {
      hideSocialFeed: viewerSafety.hideSocialFeed,
      sensitiveFilter: viewerSafety.sensitiveContentFilter,
    }, hiddenIds);

    const savedIds = new Set<string>();
    const likedIds = new Set<string>();
    if (user) {
      const ids = filtered.map((p) => p.id);
      const [{ data: saved }, { data: liked }] = await Promise.all([
        supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id).in("post_id", ids),
        supabaseAdmin
          .from("explore_events")
          .select("post_id")
          .eq("actor_type", "authed")
          .eq("actor_key", user.id)
          .eq("event_type", "like")
          .in("post_id", ids),
      ]);
      for (const s of saved ?? []) savedIds.add((s as { post_id: string }).post_id);
      for (const l of liked ?? []) likedIds.add((l as { post_id: string }).post_id);
    }

    const mapped = filtered.map((p) =>
      mapExplorePostRow(p as Parameters<typeof mapExplorePostRow>[0], {
        supabaseUrl: supabaseUrl(),
        savedIds,
        likedIds,
      }),
    );
    const data = await enrichExplorePostsWithSoundUrls(supabaseAdmin, mapped, supabaseUrl());

    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to load related posts");
  }
}
