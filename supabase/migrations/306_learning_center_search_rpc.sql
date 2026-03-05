-- 306_learning_center_search_rpc.sql
-- RPC for full-text search over learning_articles (public, published only).

CREATE OR REPLACE FUNCTION public.search_learning_articles(
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
  rank real
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
    ts_rank(a.search_vector, plainto_tsquery('english', p_query)) AS rank
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

COMMENT ON FUNCTION public.search_learning_articles IS 'Full-text search over published non-internal learning articles.';
