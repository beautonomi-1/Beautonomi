-- ============================================================================
-- Migration 225: Explore comments and comment_count
-- ============================================================================
-- Adds explore_comments table, comment_count to explore_posts, RLS, and trigger.
-- ============================================================================

-- 1. explore_comments table
CREATE TABLE IF NOT EXISTS explore_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES explore_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    mentioned_user_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT explore_comments_body_not_empty CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_explore_comments_post ON explore_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_explore_comments_created ON explore_comments(post_id, created_at DESC);

COMMENT ON TABLE explore_comments IS 'Comments on explore posts. body may contain @username text; mentioned_user_ids stores tagged user ids.';

-- 2. Add comment_count to explore_posts (nullable for backfill, then default 0)
ALTER TABLE explore_posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0);

-- 3. Trigger to update comment_count on explore_posts
CREATE OR REPLACE FUNCTION explore_update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE explore_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE explore_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS explore_comments_count_trigger ON explore_comments;
CREATE TRIGGER explore_comments_count_trigger
    AFTER INSERT OR DELETE ON explore_comments
    FOR EACH ROW
    EXECUTE FUNCTION explore_update_comment_count();

-- 4. updated_at trigger for explore_comments
DROP TRIGGER IF EXISTS explore_comments_updated_at ON explore_comments;
CREATE TRIGGER explore_comments_updated_at
    BEFORE UPDATE ON explore_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS for explore_comments
ALTER TABLE explore_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on published posts (via post_id join in app, or we allow SELECT and filter in API)
CREATE POLICY "Public can read explore comments"
    ON explore_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM explore_posts ep
            WHERE ep.id = explore_comments.post_id
            AND ep.status = 'published' AND ep.is_hidden = false
        )
    );

-- Authenticated users can insert their own comment
CREATE POLICY "Users can insert own explore comment"
    ON explore_comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own comment
CREATE POLICY "Users can update own explore comment"
    ON explore_comments FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own explore comment"
    ON explore_comments FOR DELETE
    USING (user_id = auth.uid());

-- Superadmin can do everything
CREATE POLICY "Superadmin can manage explore comments"
    ON explore_comments FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- 6. Backfill comment_count for existing posts
UPDATE explore_posts ep
SET comment_count = COALESCE(
    (SELECT COUNT(*)::INTEGER FROM explore_comments ec WHERE ec.post_id = ep.id),
    0
);
