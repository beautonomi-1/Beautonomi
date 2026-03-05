-- 307_learning_center_tree_and_content_type.sql
-- Tree: parent_id on categories. Optional content_type on articles (article | video_guide).

-- Categories: allow nesting
ALTER TABLE public.learning_categories
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.learning_categories(id) ON DELETE SET NULL;

UPDATE public.learning_categories SET parent_id = NULL WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_categories_parent ON public.learning_categories(parent_id);

-- Prevent self-reference (optional; application also checks)
ALTER TABLE public.learning_categories
ADD CONSTRAINT learning_categories_no_self_parent
CHECK (parent_id IS NULL OR parent_id != id);

-- Articles: optional content type for search segregation (article | video_guide)
ALTER TABLE public.learning_articles
ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'article'
CHECK (content_type IN ('article', 'video_guide'));

COMMENT ON COLUMN public.learning_categories.parent_id IS 'Parent category for tree; NULL = root.';
COMMENT ON COLUMN public.learning_articles.content_type IS 'article = standard; video_guide = appears in Video Guides section in search.';
