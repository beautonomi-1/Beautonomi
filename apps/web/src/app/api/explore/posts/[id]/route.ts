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
import type { ExplorePost } from "@/types/explore";
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
  };
}

/**
 * GET /api/explore/posts/[id]
 * Public: fetch single published post.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseAdmin = await getSupabaseAdmin();
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: row, error } = await supabaseAdmin
      .from("explore_posts")
      .select(
        "id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, created_at, updated_at"
      )
      .eq("id", id)
      .eq("status", "published")
      .eq("is_hidden", false)
      .single();

    if (error || !row) {
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

    const post = mapToExplorePost(enriched, savedIds, likedIds);
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
        "create_explore_posts"
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
    const updates: Record<string, unknown> = {};
    if (body.caption !== undefined) updates.caption = body.caption;
    if (body.media_urls !== undefined) {
      updates.media_urls = (body.media_urls as string[]).map((u: string) => toStoragePath(String(u)));
    }
    if (body.status !== undefined) {
      updates.status = body.status === "published" ? "published" : "draft";
      if (body.status === "published") {
        updates.published_at = new Date().toISOString();
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
          p_post_id: (post as any).id,
        });
      } catch (pointsErr) {
        console.warn("[explore/posts PATCH] Award points for publish:", pointsErr);
      }
    }

    const explorePost: ExplorePost = {
      ...post,
      provider: post.providers
        ? (() => {
            const p = Array.isArray(post.providers) ? (post.providers as any)[0] : (post.providers as any);
            return { business_name: p?.business_name ?? "", slug: p?.slug ?? "" };
          })()
        : { business_name: "", slug: "" },
      media_urls: (post.media_urls || []).map((p: string) =>
        toPublicMediaUrl(p, supabaseUrl())
      ),
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
        "create_explore_posts"
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
