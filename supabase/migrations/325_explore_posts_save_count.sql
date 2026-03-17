-- ============================================================================
-- Migration 325: Explore posts save_count
-- ============================================================================
-- Adds save_count to explore_posts, trigger on explore_saved to keep it in sync,
-- and backfill from existing explore_saved rows.
-- ============================================================================

-- 1. Add save_count column to explore_posts
ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0 CHECK (save_count >= 0);

COMMENT ON COLUMN explore_posts.save_count IS 'Number of users who saved this post. Kept in sync by trigger on explore_saved.';

-- 2. Trigger function to update save_count when explore_saved rows change
CREATE OR REPLACE FUNCTION explore_update_save_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE explore_posts SET save_count = save_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE explore_posts SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS explore_saved_save_count_trigger ON explore_saved;
CREATE TRIGGER explore_saved_save_count_trigger
    AFTER INSERT OR DELETE ON explore_saved
    FOR EACH ROW
    EXECUTE FUNCTION explore_update_save_count();

-- 3. Backfill save_count from current explore_saved counts
UPDATE explore_posts ep
SET save_count = COALESCE(
    (SELECT count(*)::integer FROM explore_saved es WHERE es.post_id = ep.id),
    0
);
