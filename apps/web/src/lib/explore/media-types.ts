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
  /** When video transcode is pending, defer portfolio append until poster is ready. */
  pending_gallery_append?: boolean;
  text_overlays?: ExploreTextOverlay[] | null;
}

export type ExplorePostRowLike = {
  id?: string;
  provider_id?: string;
  created_by_user_id?: string | null;
  caption?: string | null;
  media_urls?: string[] | null;
  tags?: string[] | null;
  status?: string;
  published_at?: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  primary_category_id?: string | null;
  offering_id?: string | null;
  created_at?: string;
  updated_at?: string;
  display_path?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  duration_ms?: number | null;
  playback_path?: string | null;
  media_meta?: ExploreMediaSlideMeta[] | null;
  sound_id?: string | null;
  providers?:
    | { business_name?: string; slug?: string; avatar_url?: string | null }
    | { business_name?: string; slug?: string; avatar_url?: string | null }[]
    | null;
  provider_business_name?: string;
  provider_slug?: string;
  provider_avatar_url?: string | null;
};
