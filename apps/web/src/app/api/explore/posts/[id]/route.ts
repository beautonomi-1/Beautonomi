import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { hasPermission } from "@/lib/auth/permissions";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getViewerSafetyContext } from "@/lib/safety/viewer-safety-context";
import { postHasSensitiveContent } from "@/lib/safety/filter-explore-posts";
import type { ExplorePost } from "@/types/explore";
import { toPublicMediaUrl, toStoragePath } from "@/lib/explore/media-urls";
import { requireSocialAccess } from "@/lib/safety/require-social-access";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const MAX_EXPLORE_MEDIA = 5;

type ExplorePostRow = {
  id: string;
  provider_id?: string;
  created_by_user_id?: string;
  caption?: string;
  media_urls?: string[];
  status?: string;
  published_at?: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  primary_category_id?: string | null;
  offering_id?: string | null;
  providers?: { business_name?: string; slug?: string };
  provider_business_name?: string;
  provider_slug?: string;
};
function mapToExplorePost(
  row: ExplorePostRow,
  savedIds: Set<string>,
  likedIds: Set<string>,
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null
): ExplorePost {
  const mediaUrls = (row.media_urls ?? []).map((p: string) =>
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
    status: (row.status === "draft" || row.status === "published" ? row.status : "published"),
    published_at: row.published_at,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    view_count: row.view_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_saved: savedIds.has(row.id),
    is_liked: likedIds.has(row.id),
    tags: row.tags ?? [],
    primary_category_id: row.primary_category_id ?? null,
    offering_id: row.offering_id ?? null,
    offering: offering ?? null,
  };
}

/**
 * GET /api/explore/posts/[id]
 * Public: fetch single published post.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseAdmin = await getSupabaseAdmin();
    const supabase = await getSupabaseServer(request);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: row, error } = await supabaseAdmin
      .from("explore_posts")
      .select(
        "id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, view_count, tags, primary_category_id, offering_id, created_at, updated_at"
      )
      .eq("id", id)
      .eq("status", "published")
      .eq("is_hidden", false)
      .single();

    if (error || !row) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const viewerSafety = await getViewerSafetyContext(user?.id, request);
    if (viewerSafety.hideSocialFeed) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }
    if (viewerSafety.sensitiveContentFilter && postHasSensitiveContent(row)) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }
    const authorId = row.created_by_user_id as string | null | undefined;
    if (
      authorId &&
      (viewerSafety.blockedUserIds.has(authorId) || viewerSafety.mutedUserIds.has(authorId))
    ) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const { data: provData } = await supabaseAdmin
      .from("providers")
      .select("id, business_name, slug")
      .eq("id", row.provider_id)
      .single();

    const enriched = {
      ...row,
      provider_business_name: provData?.business_name ?? "",
      provider_slug: provData?.slug ?? "",
    };

    let offering: { id: string; name: string; price?: number; duration_minutes?: number } | null = null;
    if (row.offering_id) {
      const { data: offRow } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .eq("id", row.offering_id)
        .single();
      if (offRow) {
        offering = { id: offRow.id, name: offRow.title ?? "", price: offRow.price != null ? Number(offRow.price) : undefined, duration_minutes: offRow.duration_minutes ?? undefined };
      }
    }

    const savedIds = new Set<string>();
    const likedIds = new Set<string>();
    if (user) {
      const [savedRes, likedRes] = await Promise.all([
        supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id).eq("post_id", id),
        supabaseAdmin
          .from("explore_events")
          .select("post_id")
          .eq("actor_type", "authed")
          .eq("actor_key", user.id)
          .eq("event_type", "like")
          .eq("post_id", id),
      ]);
      if (savedRes.data?.length) savedIds.add(id);
      if (likedRes.data?.length) likedIds.add(id);
    }

    const post = mapToExplorePost(enriched, savedIds, likedIds, offering);
    return successResponse(post);
  } catch (error) {
    return handleApiError(error, "Failed to fetch post");
  }
}

/**
 * PATCH /api/explore/posts/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    await requireSocialAccess(user.id, "ugc_create", request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const isOwner =
      (await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .single()).data != null;

    if (!isOwner) {
      const hasCreatePermission = await hasPermission(
        user.id,
        "create_explore_posts",
        undefined,
        request,
      );
      if (!hasCreatePermission) {
        return errorResponse(
          "Permission denied: create_explore_posts required",
          "FORBIDDEN",
          403
        );
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("explore_posts")
      .select("provider_id")
      .eq("id", id)
      .single();

    if (!existing || existing.provider_id !== providerId) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const updates: Record<string, any> = {};
    if (body.caption !== undefined) updates.caption = body.caption;
    if (body.media_urls !== undefined) {
      if (!Array.isArray(body.media_urls) || body.media_urls.length > MAX_EXPLORE_MEDIA) {
        return errorResponse(`Explore posts can include up to ${MAX_EXPLORE_MEDIA} media files`, "VALIDATION_ERROR", 400);
      }
      updates.media_urls = (body.media_urls as string[]).map((u: string) => toStoragePath(String(u)));
    }
    if (body.tags !== undefined) {
      updates.tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
        : [];
    }
    if (body.status !== undefined) {
      updates.status = body.status === "published" ? "published" : "draft";
      if (body.status === "published") {
        updates.published_at = new Date().toISOString();
      }
    }
    if (body.primary_category_slug !== undefined || body.primary_category_id !== undefined) {
      let primary_category_id: string | null = null;
      if (body.primary_category_id && typeof body.primary_category_id === "string") {
        const { data: cat } = await supabaseAdmin
          .from("global_service_categories")
          .select("id")
          .eq("id", body.primary_category_id)
          .eq("is_active", true)
          .single();
        if (cat) primary_category_id = cat.id;
      } else if (body.primary_category_slug && typeof body.primary_category_slug === "string") {
        const { data: cat } = await supabaseAdmin
          .from("global_service_categories")
          .select("id")
          .eq("slug", body.primary_category_slug.trim().toLowerCase())
          .eq("is_active", true)
          .single();
        if (cat) primary_category_id = cat.id;
      }
      updates.primary_category_id = primary_category_id;
    }
    if (body.offering_id !== undefined) {
      const val = body.offering_id;
      if (val === null || val === "") {
        updates.offering_id = null;
      } else if (typeof val === "string") {
        const { data: off } = await supabaseAdmin.from("offerings").select("id, provider_id").eq("id", val).single();
        if (off && off.provider_id === providerId) updates.offering_id = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: post, error } = await supabaseAdmin
      .from("explore_posts")
      .update(updates)
      .eq("id", id)
      .select(
        `
        id,
        provider_id,
        created_by_user_id,
        caption,
        media_urls,
        status,
        published_at,
        like_count,
        comment_count,
        view_count,
        tags,
        primary_category_id,
        offering_id,
        created_at,
        updated_at,
        providers:provider_id(business_name, slug)
      `
      )
      .single();

    if (error) return handleApiError(error, "Failed to update post");

    // Award reward points when post is published (idempotent: no double award)
    if (updates.status === "published") {
      try {
        await supabaseAdmin.rpc("award_provider_points_for_explore_post", {
          p_provider_id: existing.provider_id,
          p_post_id: post.id,
        });
      } catch (pointsErr) {
        console.warn("[explore/posts PATCH] Award points for publish:", pointsErr);
      }
    }

    let offering: { id: string; name: string; price?: number; duration_minutes?: number } | null = null;
    if (post.offering_id) {
      const { data: offRow } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .eq("id", post.offering_id)
        .single();
      if (offRow) {
        offering = { id: offRow.id, name: offRow.title ?? "", price: offRow.price != null ? Number(offRow.price) : undefined, duration_minutes: offRow.duration_minutes ?? undefined };
      }
    }
    const explorePost: ExplorePost = {
      ...post,
      provider: post.providers
        ? (() => {
            type Prov = { business_name?: string; slug?: string };
            const p = Array.isArray(post.providers) ? (post.providers as Prov[])[0] : (post.providers as Prov);
            return { business_name: p?.business_name ?? "", slug: p?.slug ?? "" };
          })()
        : { business_name: "", slug: "" },
      media_urls: (post.media_urls || []).map((p: string) =>
        toPublicMediaUrl(p, supabaseUrl())
      ),
      view_count: post.view_count ?? 0,
      tags: post.tags ?? [],
      primary_category_id: post.primary_category_id ?? null,
      offering: offering ?? null,
    };
    return successResponse(explorePost);
  } catch (error) {
    return handleApiError(error, "Failed to update post");
  }
}

/**
 * DELETE /api/explore/posts/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    await requireSocialAccess(user.id, "ugc_create", request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const isOwner =
      (await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .single()).data != null;

    if (!isOwner) {
      const hasCreatePermission = await hasPermission(
        user.id,
        "create_explore_posts",
        undefined,
        request,
      );
      if (!hasCreatePermission) {
        return errorResponse(
          "Permission denied: create_explore_posts required",
          "FORBIDDEN",
          403
        );
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("explore_posts")
      .select("provider_id, media_urls")
      .eq("id", id)
      .single();

    if (!existing || existing.provider_id !== providerId) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const { error } = await supabaseAdmin.from("explore_posts").delete().eq("id", id);

    if (error) return handleApiError(error, "Failed to delete post");

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete post");
  }
}
