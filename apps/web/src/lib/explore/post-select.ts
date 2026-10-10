/** Flat column list for explore_posts (no join). */
export const EXPLORE_POST_COLUMNS =
  "id, provider_id, created_by_user_id, caption, media_urls, tags, status, published_at, like_count, comment_count, view_count, primary_category_id, offering_id, created_at, updated_at, display_path, media_width, media_height, duration_ms, playback_path, media_meta, sound_id";

/** Supabase select with provider join for feed/detail routes. */
export const EXPLORE_POST_SELECT_WITH_PROVIDER = `
  ${EXPLORE_POST_COLUMNS},
  providers:provider_id(business_name, slug, avatar_url)
`;
