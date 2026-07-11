-- Migration 775: Fuzzy Explore search (caption, tags, provider name, offering title)
--
-- Replaces plain ILIKE substring matching with combined full-text (tsvector),
-- pg_trgm similarity (typo tolerance), and substring fallback. Powers
-- GET /api/explore/posts?search=... for customer mobile, web, and admin.

SET search_path = public, extensions;

-- Full-text search vector from caption + tags.
--
-- A GENERATED column can't be used here: to_tsvector('english', ...) resolves the
-- config name through a STABLE text->regconfig cast, so Postgres rejects it as
-- "generation expression is not immutable". We maintain the column via a trigger
-- instead (the same convention as update_updated_at_column) and backfill existing rows.
ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.explore_posts_update_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector(
      'english',
      coalesce(NEW.caption, '') || ' ' || coalesce(array_to_string(NEW.tags, ' '), '')
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS explore_posts_search_vector_trigger ON explore_posts;
CREATE TRIGGER explore_posts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF caption, tags ON explore_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.explore_posts_update_search_vector();

-- Backfill existing rows.
UPDATE explore_posts
SET search_vector = to_tsvector(
  'english',
  coalesce(caption, '') || ' ' || coalesce(array_to_string(tags, ' '), '')
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_explore_posts_search_vector
  ON explore_posts USING GIN (search_vector);

-- Trigram indexes for fuzzy caption matching (provider business_name indexed in 736)
CREATE INDEX IF NOT EXISTS idx_explore_posts_caption_trgm
  ON explore_posts USING gin (caption gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_offerings_title_trgm
  ON offerings USING gin (title gin_trgm_ops);

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
  search_rank real
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
    s.search_rank
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

COMMENT ON FUNCTION public.explore_search_posts IS
  'Fuzzy search over published Explore posts: caption, tags, provider name, and linked offering title. Ranked by relevance then recency.';

GRANT EXECUTE ON FUNCTION public.explore_search_posts TO authenticated, anon, service_role;
