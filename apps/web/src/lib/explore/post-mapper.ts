import { toPublicMediaUrl } from "@/lib/explore/media-urls";
import type { ExplorePost } from "@/types/explore";
import type { ExploreMediaSlideMeta, ExplorePostRowLike } from "@/lib/explore/media-types";

function resolveProvider(row: ExplorePostRowLike): ExplorePost["provider"] {
  if (row.providers) {
    const p = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    return {
      business_name: p?.business_name ?? "",
      slug: p?.slug ?? "",
      avatar_url: p?.avatar_url ?? null,
    };
  }
  if (row.provider_business_name != null || row.provider_slug != null) {
    return {
      business_name: row.provider_business_name ?? "",
      slug: row.provider_slug ?? "",
      avatar_url: row.provider_avatar_url ?? null,
    };
  }
  return { business_name: "", slug: "", avatar_url: null };
}

function mapMediaMeta(
  meta: ExploreMediaSlideMeta[] | null | undefined,
  supabaseUrl: string | undefined,
): ExploreMediaSlideMeta[] | null {
  if (!meta?.length) return null;
  return meta.map((slide) => ({
    ...slide,
    display_path: slide.display_path
      ? toPublicMediaUrl(slide.display_path, supabaseUrl)
      : slide.display_path,
    playback_path: slide.playback_path
      ? toPublicMediaUrl(slide.playback_path, supabaseUrl)
      : slide.playback_path,
  }));
}

export function mapExplorePostRow(
  row: ExplorePostRowLike,
  options: {
    supabaseUrl?: string;
    savedIds?: Set<string>;
    likedIds?: Set<string>;
    offering?: ExplorePost["offering"];
    collectionIds?: string[];
  } = {},
): ExplorePost {
  const supabaseUrl = options.supabaseUrl;
  const mediaUrls = (row.media_urls ?? []).map((p) => toPublicMediaUrl(p, supabaseUrl));
  const displayPath = row.display_path
    ? toPublicMediaUrl(row.display_path, supabaseUrl)
    : null;
  const playbackPath = row.playback_path
    ? toPublicMediaUrl(row.playback_path, supabaseUrl)
    : null;

  return {
    id: row.id!,
    provider_id: row.provider_id!,
    provider: resolveProvider(row),
    created_by_user_id: row.created_by_user_id ?? null,
    caption: row.caption ?? null,
    media_urls: mediaUrls,
    status: row.status === "draft" ? "draft" : "published",
    published_at: row.published_at!,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    view_count: row.view_count ?? 0,
    created_at: row.created_at!,
    updated_at: row.updated_at!,
    is_saved: options.savedIds?.has(row.id!) ?? false,
    is_liked: options.likedIds?.has(row.id!) ?? false,
    tags: row.tags ?? [],
    primary_category_id: row.primary_category_id ?? null,
    offering_id: row.offering_id ?? null,
    offering: options.offering ?? null,
    collection_ids: options.collectionIds,
    display_url: displayPath,
    media_width: row.media_width ?? null,
    media_height: row.media_height ?? null,
    duration_ms: row.duration_ms ?? null,
    playback_path: playbackPath,
    media_meta: mapMediaMeta(row.media_meta ?? null, supabaseUrl),
    sound_id: row.sound_id ?? null,
  };
}
