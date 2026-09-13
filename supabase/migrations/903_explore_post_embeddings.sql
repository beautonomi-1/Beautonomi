-- Migration 903: pgvector embeddings for explore posts (similar looks)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.explore_post_embeddings (
  post_id UUID PRIMARY KEY REFERENCES public.explore_posts(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explore_post_embeddings_ivfflat
  ON public.explore_post_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.explore_post_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_post_embeddings_superadmin ON public.explore_post_embeddings;
CREATE POLICY explore_post_embeddings_superadmin ON public.explore_post_embeddings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE OR REPLACE FUNCTION public.explore_match_posts(
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 12,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  post_id UUID,
  distance DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.post_id,
    (e.embedding <=> p_query_embedding) AS distance
  FROM public.explore_post_embeddings e
  INNER JOIN public.explore_posts ep ON ep.id = e.post_id
  WHERE ep.status = 'published'
    AND ep.is_hidden = false
    AND (p_exclude_id IS NULL OR e.post_id <> p_exclude_id)
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;
