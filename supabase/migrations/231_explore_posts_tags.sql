-- ============================================================================
-- Migration 231: Add tags to explore_posts
-- ============================================================================
-- Adds a tags array column for provider-applied tags (e.g. "hair", "braids")
-- and a GIN index for fast array overlap queries.
-- ============================================================================

-- 1. Add tags column
ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- 2. GIN index for fast @> and && queries on tags
CREATE INDEX IF NOT EXISTS idx_explore_posts_tags
  ON explore_posts USING GIN (tags);

-- 3. Composite index for category-based filtering via provider associations
CREATE INDEX IF NOT EXISTS idx_explore_posts_provider_published
  ON explore_posts (provider_id, published_at DESC)
  WHERE status = 'published' AND is_hidden = false;

COMMENT ON COLUMN explore_posts.tags IS 'Provider-applied tags for categorisation (e.g. hair, braids, nails). Used for Explore feed filtering.';
