-- ============================================================================
-- Migration 326: Explore posts primary category
-- ============================================================================
-- Adds primary_category_id to explore_posts for post-level category filtering.
-- ============================================================================

ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES global_service_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_explore_posts_primary_category
  ON explore_posts(primary_category_id) WHERE primary_category_id IS NOT NULL;

COMMENT ON COLUMN explore_posts.primary_category_id IS 'Primary service category for this post; used for category filter and discovery.';

-- Backfill: set from provider's first global category where possible
UPDATE explore_posts ep
SET primary_category_id = (
  SELECT pgca.global_category_id
  FROM provider_global_category_associations pgca
  WHERE pgca.provider_id = ep.provider_id
  LIMIT 1
)
WHERE ep.primary_category_id IS NULL;
