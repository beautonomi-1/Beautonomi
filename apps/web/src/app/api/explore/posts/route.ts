import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { hasPermission } from "@/lib/auth/permissions";
import type { ExplorePost, ExplorePostsCursorResponse } from "@/types/explore";
import { toPublicMediaUrl, toStoragePath } from "@/lib/explore/media-urls";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;

function mapToExplorePost(row: any, savedIds: Set<string>, likedIds: Set<string>): ExplorePost {
  const mediaUrls = (row.media_urls || []).map((p: string) =>
    toPublicMediaUrl(p, supabaseUrl())
  );
  const provider = row.providers
    ? { business_name: row.providers.business_name, slug: row.providers.slug }
    : row.provider_business_name
      ? { business_name: row.provider_business_name, slug: row.provider_slug }
      : { business_name: "", slug: "" };
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider,
    created_by_user_id: row.created_by_user_id,
    caption: row.caption,
    media_urls: mediaUrls,
    status: row.status,
    published_at: row.published_at,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_saved: savedIds.has(row.id),
    is_liked: likedIds.has(row.id),
    tags: row.tags ?? [],
  };
}

function calculateTrendingScore(post: {
  like_count: number;
  comment_count: number;
  save_count?: number;
  published_at: string;
}): number {
  const likes = post.like_count ?? 0;
  const comments = post.comment_count ?? 0;
  const saves = (post as any).save_count ?? 0;
  const hoursSincePost =
    (Date.now() - new Date(post.published_at).getTime()) / (1000 * 60 * 60);

  return likes * 2 + comments * 3 + saves * 5 - hoursSincePost * 0.5;
}

/**
 * GET /api/explore/posts
 * List published posts with cursor pagination. Optional auth for is_saved/is_liked.
 *
 * Query params:
 *   - cursor   — base64url-encoded cursor for pagination
 *   - limit    — max items per page (default 20, max 50)
 *   - sort     — "chronological" (default) or "trending"
 *   - category — global service category slug (e.g. "hair") - filters by provider's categories
 *   - search   — text search on caption and provider name
 *   - tags     — comma-separated tags to filter by (e.g. "braids,balayage")
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const cursorEncoded = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const sortMode = searchParams.get("sort") === "trending" ? "trending" : "chronological";
    const categorySlug = searchParams.get("category")?.trim().toLowerCase() || null;
    const searchQuery = searchParams.get("search")?.trim() || null;
    const tagsParam = searchParams.get("tags")?.trim() || null;
    const filterTags = tagsParam ? tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : null;

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

    // Option A: If filtering by category, first get provider IDs associated with that category
    let categoryProviderIds: string[] | null = null;
    if (categorySlug) {
      const { data: catRow } = await supabaseAdmin
        .from("global_service_categories")
        .select("id")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .single();

      if (catRow) {
        const { data: assocs } = await supabaseAdmin
          .from("provider_global_category_associations")
          .select("provider_id")
          .eq("global_category_id", catRow.id);

        categoryProviderIds = (assocs || []).map((a: any) => a.provider_id);
        if (categoryProviderIds.length === 0) {
          return successResponse({ data: [], next_cursor: undefined, has_more: false });
        }
      } else {
        return successResponse({ data: [], next_cursor: undefined, has_more: false });
      }
    }

    const fetchLimit = sortMode === "trending" ? Math.max(limit * 3, 100) : limit + 1;

    let query = supabaseAdmin
      .from("explore_posts")
      .select(
        "id, provider_id, created_by_user_id, caption, media_urls, tags, status, published_at, like_count, comment_count, created_at, updated_at"
      )
      .eq("status", "published")
      .eq("is_hidden", false)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit);

    if (cursorPublishedAt && cursorId) {
      query = query.lt("published_at", cursorPublishedAt);
    }

    // Option A: filter by provider's categories
    if (categoryProviderIds) {
      query = query.in("provider_id", categoryProviderIds);
    }

    // Option B: filter by post tags
    if (filterTags && filterTags.length > 0) {
      query = query.overlaps("tags", filterTags);
    }

    // Search by caption text
    if (searchQuery) {
      query = query.ilike("caption", `%${searchQuery}%`);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("[explore/posts] Fetch error:", error);
      return handleApiError(error, "Failed to fetch posts");
    }

    let items = rows || [];

    if (items.length === 0 && process.env.NODE_ENV === "development") {
      const [
        { count: total },
        { count: published },
        { count: hidden },
      ] = await Promise.all([
        supabaseAdmin.from("explore_posts").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("explore_posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
        supabaseAdmin
          .from("explore_posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .eq("is_hidden", true),
      ]);
      console.log(
        "[explore/posts] 0 posts returned. DB: total=" +
          (total ?? "?") +
          ", published=" +
          (published ?? "?") +
          ", published+hidden=" +
          (hidden ?? "?") +
          (categorySlug ? `, category=${categorySlug}` : "") +
          (searchQuery ? `, search=${searchQuery}` : "") +
          (filterTags ? `, tags=${filterTags.join(",")}` : "")
      );
    }

    // Enrich with provider data
    if (items.length > 0) {
      const providerIds = [...new Set(items.map((r: any) => r.provider_id))];
      const { data: provData } = await supabaseAdmin
        .from("providers")
        .select("id, business_name, slug")
        .in("id", providerIds);
      const provMap = new Map((provData || []).map((p: any) => [p.id, p]));

      items = items.map((r: any) => ({
        ...r,
        provider_business_name: provMap.get(r.provider_id)?.business_name ?? "",
        provider_slug: provMap.get(r.provider_id)?.slug ?? "",
      }));

      // If search includes provider name (not just caption), re-filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        items = items.filter(
          (r: any) =>
            (r.caption && r.caption.toLowerCase().includes(q)) ||
            (r.provider_business_name && r.provider_business_name.toLowerCase().includes(q)),
        );
      }
    }

    // Apply trending sort when requested
    if (sortMode === "trending") {
      items.sort(
        (a: any, b: any) => calculateTrendingScore(b) - calculateTrendingScore(a)
      );
      items = items.slice(0, limit + 1);
    }

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    const last = slice[slice.length - 1];

    const postIds = slice.map((r: any) => r.id);
    const savedIds = new Set<string>();
    const likedIds = new Set<string>();

    if (user && postIds.length > 0) {
      const [savedRes, likedRes] = await Promise.all([
        supabaseAdmin
          .from("explore_saved")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds),
        supabaseAdmin
          .from("explore_events")
          .select("post_id")
          .eq("actor_type", "authed")
          .eq("actor_key", user.id)
          .eq("event_type", "like")
          .in("post_id", postIds),
      ]);
      (savedRes.data || []).forEach((r: any) => savedIds.add(r.post_id));
      (likedRes.data || []).forEach((r: any) => likedIds.add(r.post_id));
    }

    const data: ExplorePost[] = slice.map((r: any) =>
      mapToExplorePost(r, savedIds, likedIds)
    );

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
    return handleApiError(error, "Failed to fetch posts");
  }
}

/**
 * POST /api/explore/posts
 * Create post. Provider owner or staff with create_explore_posts permission.
 * Accepts optional tags[] for categorisation.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([
      "provider_owner",
      "provider_staff",
      "superadmin",
    ]);
    const supabaseAdmin = await getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const isOwner =
      (await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .single()).data != null;

    if (!isOwner) {
      const hasCreatePermission = await hasPermission(
        user.id,
        "create_explore_posts" as any
      );
      if (!hasCreatePermission) {
        return errorResponse("Permission denied: create_explore_posts required", "FORBIDDEN", 403);
      }
    }

    const body = await request.json();
    const { caption, media_urls: rawMediaUrls = [], status = "draft", tags = [] } = body;

    if (!Array.isArray(rawMediaUrls) || rawMediaUrls.length === 0) {
      return errorResponse("At least one media file is required", "VALIDATION_ERROR", 400);
    }

    const media_urls = rawMediaUrls.map((u: string) => toStoragePath(String(u)));

    const sanitizedTags = Array.isArray(tags)
      ? [...new Set(tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
      : [];

    const publishedAt =
      status === "published" ? new Date().toISOString() : new Date().toISOString();

    const { data: post, error } = await supabaseAdmin
      .from("explore_posts")
      .insert({
        provider_id: providerId,
        created_by_user_id: user.id,
        caption: caption || null,
        media_urls,
        tags: sanitizedTags,
        status: status === "published" ? "published" : "draft",
        published_at: publishedAt,
      })
      .select(
        `
        id,
        provider_id,
        created_by_user_id,
        caption,
        media_urls,
        tags,
        status,
        published_at,
        like_count,
        created_at,
        updated_at,
        providers:provider_id(business_name, slug)
      `
      )
      .single();

    if (error) {
      return handleApiError(error, "Failed to create post");
    }

    const postStatus = (post as any).status;
    if (postStatus === "published") {
      try {
        await supabaseAdmin.rpc("award_provider_points_for_explore_post", {
          p_provider_id: providerId,
          p_post_id: (post as any).id,
        });
      } catch (pointsError) {
        console.warn("[explore/posts] Award points for post after booking:", pointsError);
      }
    }

    const explorePost = mapToExplorePost(post, new Set(), new Set());
    return successResponse(explorePost, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create post");
  }
}
