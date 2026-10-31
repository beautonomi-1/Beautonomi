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
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import { EXPLORE_POST_SELECT_WITH_PROVIDER } from "@/lib/explore/post-select";
import {
  denormalizeFirstSlideFromMeta,
  mergeExploreMediaMetaPatch,
  validateProviderMediaPaths,
} from "@/lib/explore/media-meta";
import {
  collectExplorePostStoragePaths,
  removeExplorePostsStoragePaths,
} from "@/lib/explore/storage-paths";
import {
  isExploreEnabled,
  isExploreProviderPostsEnabled,
  isExploreSoundCatalogEnabled,
} from "@/lib/explore/explore-feature-gates";
import { runExplorePublishSideEffects } from "@/lib/explore/publish-side-effects";
import { enqueueExplorePostSafetyScan } from "@/lib/safety/explore-post-safety-scan";
import { enqueueExploreVideoProcessing } from "@/lib/explore/enqueue-video-processing";
import { enrichExplorePostWithSoundUrl } from "@/lib/explore/sound-enrich";
import { burnExplorePhotoOverlaysForPublish } from "@/lib/explore/explore-photo-burn";
import { resolveExplorePostSoundIdForWrite } from "@/lib/explore/validate-explore-sound-id";
import { firstSlideIsVideo } from "@/lib/explore/video-media";

export const maxDuration = 60;

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const MAX_EXPLORE_MEDIA = 5;

function mapToExplorePost(
  row: Parameters<typeof mapExplorePostRow>[0],
  savedIds: Set<string>,
  likedIds: Set<string>,
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null,
): ExplorePost {
  return mapExplorePostRow(row, {
    supabaseUrl: supabaseUrl(),
    savedIds,
    likedIds,
    offering,
  });
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
    if (!(await isExploreEnabled(null))) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }
    const { id } = await params;
    const supabaseAdmin = await getSupabaseAdmin();
    const supabase = await getSupabaseServer(request);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: row, error } = await supabaseAdmin
      .from("explore_posts")
      .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
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

    let post = mapToExplorePost(row, savedIds, likedIds, offering);
    post = await enrichExplorePostWithSoundUrl(supabaseAdmin, post, supabaseUrl());
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

    if (!(await isExploreProviderPostsEnabled(null))) {
      return errorResponse("Explore posts are disabled", "FORBIDDEN", 403);
    }

    const { data: existing } = await supabaseAdmin
      .from("explore_posts")
      .select(
        "provider_id, status, media_urls, display_path, playback_path, media_meta",
      )
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
      const nextUrls = (body.media_urls as string[]).map((u: string) => toStoragePath(String(u)));
      const validated = validateProviderMediaPaths(providerId, nextUrls, body.media_meta);
      if (!validated.ok) {
        return errorResponse("message" in validated ? validated.message : "Invalid media", "VALIDATION_ERROR", 400);
      }
      const willBePublished =
        body.status === "published" ||
        (body.status === undefined && existing.status === "published");
      let mediaMeta = validated.mediaMeta;
      if (willBePublished) {
        mediaMeta = await burnExplorePhotoOverlaysForPublish(
          supabaseAdmin,
          providerId,
          nextUrls,
          mediaMeta,
          { forceAllImageSlides: false },
        );
      }
      const oldPaths = new Set(collectExplorePostStoragePaths(existing));
      const newPaths = new Set(collectExplorePostStoragePaths({
        media_urls: nextUrls,
        media_meta: mediaMeta,
        display_path: denormalizeFirstSlideFromMeta(nextUrls, mediaMeta).display_path,
        playback_path: denormalizeFirstSlideFromMeta(nextUrls, mediaMeta).playback_path,
      }));
      const toRemove = [...oldPaths].filter((p) => !newPaths.has(p));
      if (toRemove.length) {
        await removeExplorePostsStoragePaths(supabaseAdmin.storage, toRemove);
      }
      updates.media_urls = nextUrls;
      updates.media_meta = mediaMeta;
      const denorm = denormalizeFirstSlideFromMeta(nextUrls, mediaMeta);
      updates.display_path = denorm.display_path;
      updates.media_width = denorm.media_width;
      updates.media_height = denorm.media_height;
      updates.duration_ms = denorm.duration_ms;
      updates.playback_path = denorm.playback_path;
    } else if (body.media_meta !== undefined) {
      const existingUrls = (existing.media_urls ?? []) as string[];
      if (!existingUrls.length) {
        return errorResponse("Post has no media", "VALIDATION_ERROR", 400);
      }
      if (!Array.isArray(body.media_meta)) {
        return errorResponse("media_meta must be an array", "VALIDATION_ERROR", 400);
      }
      const existingMeta = (existing.media_meta ?? []) as import("@/lib/explore/media-types").ExploreMediaSlideMeta[];
      const mergedInput = mergeExploreMediaMetaPatch(
        existingMeta,
        existingUrls,
        body.media_meta as import("@/lib/explore/media-types").ExploreMediaSlideMeta[],
      );
      const validated = validateProviderMediaPaths(providerId, existingUrls, mergedInput);
      if (!validated.ok) {
        return errorResponse("message" in validated ? validated.message : "Invalid media", "VALIDATION_ERROR", 400);
      }
      const willBePublished =
        body.status === "published" ||
        (body.status === undefined && existing.status === "published");
      let mediaMeta = validated.mediaMeta;
      if (willBePublished) {
        mediaMeta = await burnExplorePhotoOverlaysForPublish(
          supabaseAdmin,
          providerId,
          existingUrls,
          mediaMeta,
          { forceAllImageSlides: false },
        );
      }
      updates.media_meta = mediaMeta;
      const denorm = denormalizeFirstSlideFromMeta(existingUrls, mediaMeta);
      updates.display_path = denorm.display_path;
      updates.media_width = denorm.media_width;
      updates.media_height = denorm.media_height;
      updates.duration_ms = denorm.duration_ms;
      updates.playback_path = denorm.playback_path;
    }
    const soundCatalogEnabled = await isExploreSoundCatalogEnabled(null);
    const effectiveUrls = (updates.media_urls ?? existing.media_urls ?? []) as string[];
    const effectiveMeta = (updates.media_meta ?? existing.media_meta ?? []) as import("@/lib/explore/media-types").ExploreMediaSlideMeta[];
    const hasVideoMedia = firstSlideIsVideo(effectiveUrls, effectiveMeta);

    if (body.sound_id !== undefined) {
      const soundCheck = await resolveExplorePostSoundIdForWrite(
        supabaseAdmin,
        body.sound_id ? String(body.sound_id) : null,
        providerId,
        { catalogEnabled: soundCatalogEnabled, hasVideoMedia },
      );
      if (soundCheck.ok === false) {
        return errorResponse(soundCheck.message, "VALIDATION_ERROR", 400);
      }
      updates.sound_id = hasVideoMedia ? soundCheck.id : null;
    } else if (
      (body.media_urls !== undefined || body.media_meta !== undefined) &&
      !hasVideoMedia
    ) {
      updates.sound_id = null;
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

    if (
      body.status === "published" &&
      existing.status !== "published" &&
      body.media_urls === undefined
    ) {
      const urls = (existing.media_urls ?? []) as string[];
      const meta = ((existing.media_meta ?? []) as import("@/lib/explore/media-types").ExploreMediaSlideMeta[]);
      const burned = await burnExplorePhotoOverlaysForPublish(
        supabaseAdmin,
        providerId,
        urls,
        meta,
        { forceAllImageSlides: false },
      );
      updates.media_meta = burned;
      const denorm = denormalizeFirstSlideFromMeta(urls, burned);
      updates.display_path = denorm.display_path;
      updates.media_width = denorm.media_width;
      updates.media_height = denorm.media_height;
      updates.duration_ms = denorm.duration_ms;
      updates.playback_path = denorm.playback_path;
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
      .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
      .single();

    if (error) return handleApiError(error, "Failed to update post");

    const wasDraft = existing.status !== "published";
    const nowPublished = post.status === "published";
    if (nowPublished && (wasDraft || updates.media_urls)) {
      await runExplorePublishSideEffects({
        postId: post.id,
        providerId: existing.provider_id,
        alsoAddToGallery: body.also_add_to_gallery === true,
        isFirstPublish: wasDraft && updates.status === "published",
      });
    } else if ((updates.media_urls || updates.media_meta) && nowPublished) {
      await enqueueExploreVideoProcessing(post.id);
      enqueueExplorePostSafetyScan(post.id);
    } else if (nowPublished && updates.caption !== undefined) {
      enqueueExplorePostSafetyScan(post.id);
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
    let updated = mapToExplorePost(post, new Set(), new Set(), offering);
    updated = await enrichExplorePostWithSoundUrl(supabaseAdmin, updated, supabaseUrl());
    return successResponse(updated);
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
      .select(
        "provider_id, media_urls, display_path, playback_path, media_meta",
      )
      .eq("id", id)
      .single();

    if (!existing || existing.provider_id !== providerId) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const paths = collectExplorePostStoragePaths(existing);
    await removeExplorePostsStoragePaths(supabaseAdmin.storage, paths);

    const { error } = await supabaseAdmin.from("explore_posts").delete().eq("id", id);

    if (error) return handleApiError(error, "Failed to delete post");

    try {
      const { deletePostEmbedding } = await import("@/lib/ai/embeddings");
      await deletePostEmbedding(id);
    } catch {
      // embeddings optional
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete post");
  }
}
