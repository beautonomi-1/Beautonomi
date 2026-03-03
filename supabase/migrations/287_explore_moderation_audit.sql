-- 287_explore_moderation_audit.sql
-- Add moderation audit fields to explore_posts for admin moderation (reason, who, when)

ALTER TABLE explore_posts
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN explore_posts.moderation_notes IS 'Admin reason for hide/action (e.g. community guidelines violation).';
COMMENT ON COLUMN explore_posts.moderated_at IS 'When the post was last moderated (e.g. hidden).';
COMMENT ON COLUMN explore_posts.moderated_by IS 'Admin user who last took moderation action.';

CREATE INDEX IF NOT EXISTS idx_explore_posts_moderated_at ON explore_posts(moderated_at DESC) WHERE moderated_at IS NOT NULL;
