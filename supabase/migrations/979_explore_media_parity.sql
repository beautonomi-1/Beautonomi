-- Explore media parity: display columns, media_meta, sounds, watch progress, comment replies, Rendobar secrets

ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS display_path TEXT,
  ADD COLUMN IF NOT EXISTS media_width INTEGER,
  ADD COLUMN IF NOT EXISTS media_height INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS playback_path TEXT,
  ADD COLUMN IF NOT EXISTS media_meta JSONB;

ALTER TABLE explore_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES explore_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_explore_comments_parent ON explore_comments(parent_id);

CREATE TABLE IF NOT EXISTS explore_sounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('platform', 'provider')),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  duration_ms INTEGER,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explore_sounds_owner ON explore_sounds(owner_type, provider_id);

ALTER TABLE explore_posts ADD COLUMN IF NOT EXISTS sound_id UUID REFERENCES explore_sounds(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS explore_watch_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES explore_posts(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('authed', 'anon')),
  actor_key TEXT NOT NULL,
  watched_ms INTEGER NOT NULL DEFAULT 0 CHECK (watched_ms >= 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_type, actor_key, post_id)
);

CREATE INDEX IF NOT EXISTS idx_explore_watch_progress_post ON explore_watch_progress(post_id);

ALTER TABLE explore_watch_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE platform_secrets
  ADD COLUMN IF NOT EXISTS rendobar_api_key TEXT,
  ADD COLUMN IF NOT EXISTS rendobar_callback_secret TEXT,
  ADD COLUMN IF NOT EXISTS rendobar_storage_connection_id TEXT;

INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category, metadata)
SELECT v.feature_key, v.feature_name, v.description, v.enabled, v.category, v.metadata
FROM (
  VALUES
    ('explore.enabled', 'Explore feed', 'Customer and web Explore feed and post detail', true, 'explore', '{}'::jsonb),
    ('explore.provider_posts', 'Explore provider posts', 'Provider create, edit, and publish Explore posts', true, 'explore', '{}'::jsonb),
    ('explore.video_upload', 'Explore video upload', 'Signed upload for Explore video bytes', true, 'explore', '{}'::jsonb),
    ('explore.video_transcode', 'Explore video transcode', 'Rendobar ffprobe and ffmpeg for Explore videos', true, 'explore', '{"max_duration_ms":60000,"max_video_bytes":262144000}'::jsonb),
    ('explore.sound_catalog', 'Explore sound catalog', 'Platform and provider sounds on Explore video posts', true, 'explore', '{}'::jsonb)
) AS v(feature_key, feature_name, description, enabled, category, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags ff WHERE ff.feature_key = v.feature_key AND ff.tenant_id IS NULL
);

DROP FUNCTION IF EXISTS public.explore_search_posts(
  text, uuid, uuid[], text[], uuid[], int, real, timestamptz, uuid
);

CREATE OR REPLACE FUNCTION public.explore_search_posts(
  p_query text,
  p_category_id uuid DEFAULT NULL,
  p_category_provider_ids uuid[] DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_provider_ids uuid[] DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_cursor_rank real DEFAULT NULL,
  p_cursor_published_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  provider_id uuid,
  created_by_user_id uuid,
  caption text,
  media_urls text[],
  tags text[],
  status text,
  published_at timestamptz,
  like_count integer,
  comment_count integer,
  view_count integer,
  primary_category_id uuid,
  offering_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  provider_business_name text,
  provider_slug text,
  search_rank real,
  display_path text,
  media_width integer,
  media_height integer,
  duration_ms integer,
  playback_path text,
  media_meta jsonb,
  sound_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_q text := NULLIF(trim(coalesce(p_query, '')), '');
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
  v_threshold real := 0.25;
  v_tsquery tsquery;
BEGIN
  IF v_q IS NULL OR length(v_q) < 2 THEN
    RETURN;
  END IF;

  v_tsquery := plainto_tsquery('english', v_q);
  IF v_tsquery = ''::tsquery THEN
    v_tsquery := NULL;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      ep.id,
      ep.provider_id,
      ep.created_by_user_id,
      ep.caption,
      ep.media_urls,
      ep.tags,
      ep.status,
      ep.published_at,
      ep.like_count,
      ep.comment_count,
      ep.view_count,
      ep.primary_category_id,
      ep.offering_id,
      ep.created_at,
      ep.updated_at,
      coalesce(p.business_name, '') AS provider_business_name,
      coalesce(p.slug, '') AS provider_slug,
      ep.display_path,
      ep.media_width,
      ep.media_height,
      ep.duration_ms,
      ep.playback_path,
      ep.media_meta,
      ep.sound_id,
      GREATEST(
        CASE WHEN ep.caption ILIKE '%' || v_q || '%' THEN 0.55::real ELSE 0::real END,
        CASE WHEN coalesce(p.business_name, '') ILIKE '%' || v_q || '%' THEN 0.5::real ELSE 0::real END,
        CASE WHEN coalesce(o.title, '') ILIKE '%' || v_q || '%' THEN 0.45::real ELSE 0::real END,
        CASE WHEN EXISTS (
          SELECT 1 FROM unnest(coalesce(ep.tags, '{}'::text[])) AS t(tag)
          WHERE tag ILIKE '%' || v_q || '%'
        ) THEN 0.4::real ELSE 0::real END,
        CASE WHEN v_tsquery IS NOT NULL THEN coalesce(ts_rank(ep.search_vector, v_tsquery), 0::real) ELSE 0::real END,
        similarity(coalesce(ep.caption, ''), v_q),
        similarity(coalesce(p.business_name, ''), v_q) * 0.9,
        similarity(coalesce(o.title, ''), v_q) * 0.85,
        coalesce((
          SELECT MAX(similarity(t.tag, v_q))
          FROM unnest(coalesce(ep.tags, '{}'::text[])) AS t(tag)
        ), 0::real) * 0.8
      ) AS search_rank
    FROM explore_posts ep
    INNER JOIN providers p ON p.id = ep.provider_id
    LEFT JOIN offerings o ON o.id = ep.offering_id
    WHERE ep.status = 'published'
      AND ep.is_hidden = false
      AND (
        ep.caption ILIKE '%' || v_q || '%'
        OR (v_tsquery IS NOT NULL AND ep.search_vector @@ v_tsquery)
        OR similarity(coalesce(ep.caption, ''), v_q) > v_threshold
        OR similarity(coalesce(p.business_name, ''), v_q) > v_threshold
        OR similarity(coalesce(o.title, ''), v_q) > v_threshold
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(ep.tags, '{}'::text[])) AS t(tag)
          WHERE tag ILIKE '%' || v_q || '%' OR similarity(tag, v_q) > v_threshold
        )
      )
      AND (
        p_category_id IS NULL
        OR ep.primary_category_id = p_category_id
        OR (
          p_category_provider_ids IS NOT NULL
          AND cardinality(p_category_provider_ids) > 0
          AND ep.provider_id = ANY (p_category_provider_ids)
        )
      )
      AND (
        p_tags IS NULL
        OR cardinality(p_tags) = 0
        OR ep.tags && p_tags
      )
      AND (
        p_provider_ids IS NULL
        OR cardinality(p_provider_ids) = 0
        OR ep.provider_id = ANY (p_provider_ids)
      )
  )
  SELECT
    s.id,
    s.provider_id,
    s.created_by_user_id,
    s.caption,
    s.media_urls,
    s.tags,
    s.status,
    s.published_at,
    s.like_count,
    s.comment_count,
    s.view_count,
    s.primary_category_id,
    s.offering_id,
    s.created_at,
    s.updated_at,
    s.provider_business_name,
    s.provider_slug,
    s.search_rank,
    s.display_path,
    s.media_width,
    s.media_height,
    s.duration_ms,
    s.playback_path,
    s.media_meta,
    s.sound_id
  FROM scored s
  WHERE (
    p_cursor_id IS NULL
    OR s.search_rank < p_cursor_rank
    OR (s.search_rank = p_cursor_rank AND s.published_at < p_cursor_published_at)
    OR (
      s.search_rank = p_cursor_rank
      AND s.published_at = p_cursor_published_at
      AND s.id < p_cursor_id
    )
  )
  ORDER BY s.search_rank DESC, s.published_at DESC, s.id DESC
  LIMIT v_limit + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.explore_search_posts TO authenticated, anon, service_role;
