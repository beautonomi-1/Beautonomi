/**
 * Explore feature types
 */

export type ExploreMediaKind = "image" | "video";

export interface ExploreTextOverlay {
  text: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  align?: "left" | "center" | "right";
  start_ms?: number;
  end_ms?: number;
}

export interface ExploreMediaSlideMeta {
  kind: ExploreMediaKind;
  display_path?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  trim_start_ms?: number | null;
  trim_end_ms?: number | null;
  source_duration_ms?: number | null;
  playback_path?: string | null;
  probe_job_id?: string | null;
  encode_job_id?: string | null;
  status?: string | null;
  error_code?: string | null;
  pending_gallery_append?: boolean;
  text_overlays?: ExploreTextOverlay[] | null;
}

export interface ExplorePost {
  id: string;
  provider_id: string;
  provider: {
    business_name: string;
    slug: string;
    avatar_url?: string | null;
  };
  created_by_user_id?: string | null;
  caption: string | null;
  media_urls: string[];
  status: "draft" | "published";
  published_at: string;
  like_count: number;
  comment_count?: number;
  view_count?: number; // Only in provider "mine" context
  created_at: string;
  updated_at: string;
  is_saved?: boolean;
  is_liked?: boolean;
  tags?: string[];
  primary_category_id?: string | null;
  primary_category_slug?: string | null;
  /** When set, "Book this look" links to this offering */
  offering_id?: string | null;
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null;
  /** Only present in GET /api/explore/saved: collection (board) IDs this saved post belongs to */
  collection_ids?: string[];
  /** Public URL for grid / OG (display JPEG or video cover). */
  display_url?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  duration_ms?: number | null;
  playback_path?: string | null;
  media_meta?: ExploreMediaSlideMeta[] | null;
  sound_id?: string | null;
  /** Resolved public URL when sound_id is set (feed/detail APIs). */
  sound_url?: string | null;
}

export interface ExploreCommentAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ExploreComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string | null;
  author: ExploreCommentAuthor;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
  updated_at: string;
  replies?: ExploreComment[];
}

export interface ExplorePostsCursorResponse {
  data: ExplorePost[];
  next_cursor?: string;
  has_more: boolean;
}

export type ExploreEventType = "view" | "like";
