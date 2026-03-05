-- 308_learning_center_search_content_type.sql
-- Search RPC returns content_type for result segregation (article | video_guide).
-- Must DROP first because return type (new column) cannot be changed in place.

DROP FUNCTION IF EXISTS public.search_learning_articles(text, integer, integer);

CREATE FUNCTION public.search_learning_articles(
  p_query text,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  category_id uuid,
  title text,
  slug text,
  summary text,
  published_at timestamptz,
  rank real,
  content_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.category_id,
    a.title,
    a.slug,
    a.summary,
    a.published_at,
    ts_rank(a.search_vector, plainto_tsquery('english', p_query)) AS rank,
    COALESCE(a.content_type, 'article')::text AS content_type
  FROM learning_articles a
  WHERE a.status = 'published'
    AND a.is_internal = false
    AND (a.published_at IS NULL OR a.published_at <= NOW())
    AND (a.scheduled_at IS NULL OR a.scheduled_at <= NOW())
    AND a.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY rank DESC, a.published_at DESC NULLS LAST
  LIMIT greatest(1, least(50, p_limit))
  OFFSET greatest(0, p_offset);
$$;

COMMENT ON FUNCTION public.search_learning_articles IS 'Full-text search over published non-internal learning articles. Returns content_type (article | video_guide).';
