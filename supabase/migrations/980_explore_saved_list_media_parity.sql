-- Extend explore_saved_list with display/media columns (Postgres cannot OR REPLACE with different return type without DROP)

DROP FUNCTION IF EXISTS public.explore_saved_list(uuid, timestamptz, uuid, int);

CREATE OR REPLACE FUNCTION public.explore_saved_list(
  p_user_id uuid,
  p_cursor_published_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  provider_id uuid,
  created_by_user_id uuid,
  caption text,
  media_urls text[],
  status text,
  published_at timestamptz,
  like_count int,
  comment_count int,
  view_count int,
  created_at timestamptz,
  updated_at timestamptz,
  provider_business_name text,
  provider_slug text,
  provider_avatar_url text,
  display_path text,
  media_width int,
  media_height int,
  duration_ms int,
  playback_path text,
  media_meta jsonb,
  sound_id uuid,
  offering_id uuid,
  tags text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ep.id,
    ep.provider_id,
    ep.created_by_user_id,
    ep.caption,
    ep.media_urls,
    ep.status,
    ep.published_at,
    ep.like_count,
    ep.comment_count,
    ep.view_count,
    ep.created_at,
    ep.updated_at,
    p.business_name,
    p.slug,
    p.avatar_url,
    ep.display_path,
    ep.media_width,
    ep.media_height,
    ep.duration_ms,
    ep.playback_path,
    ep.media_meta,
    ep.sound_id,
    ep.offering_id,
    ep.tags
  FROM explore_saved es
  JOIN explore_posts ep ON ep.id = es.post_id
  JOIN providers p ON p.id = ep.provider_id
  WHERE es.user_id = p_user_id
    AND ep.status = 'published'
    AND ep.is_hidden = false
    AND (
      p_cursor_published_at IS NULL
      OR (ep.published_at, ep.id) < (p_cursor_published_at, p_cursor_id)
    )
  ORDER BY ep.published_at DESC, ep.id DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.explore_saved_list TO authenticated, service_role;
