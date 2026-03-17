-- ============================================================================
-- Migration 327: view_count on explore_posts + offering_id for "Book this look"
-- ============================================================================

-- 1. view_count on explore_posts (kept in sync by trigger on explore_events view)
ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0);

COMMENT ON COLUMN explore_posts.view_count IS 'Number of views. Kept in sync by trigger on explore_events (event_type=view).';

CREATE OR REPLACE FUNCTION explore_update_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_type = 'view' THEN
    UPDATE explore_posts SET view_count = view_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.event_type = 'view' THEN
    UPDATE explore_posts SET view_count = GREATEST(0, view_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS explore_events_view_count_trigger ON explore_events;
CREATE TRIGGER explore_events_view_count_trigger
  AFTER INSERT OR DELETE ON explore_events
  FOR EACH ROW
  EXECUTE FUNCTION explore_update_view_count();

-- Backfill view_count from explore_events
UPDATE explore_posts ep
SET view_count = COALESCE(
  (SELECT count(*)::integer FROM explore_events ee WHERE ee.post_id = ep.id AND ee.event_type = 'view'),
  0
);

-- 2. offering_id for "Book this look" (link post to a specific offering)
ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS offering_id UUID REFERENCES offerings(id) ON DELETE SET NULL;

COMMENT ON COLUMN explore_posts.offering_id IS 'Optional offering to book from this post ("Book this look").';

CREATE INDEX IF NOT EXISTS idx_explore_posts_offering ON explore_posts(offering_id) WHERE offering_id IS NOT NULL;
