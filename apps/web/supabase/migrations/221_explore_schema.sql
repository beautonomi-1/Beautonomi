-- ============================================================================
-- Migration 221: Explore Feature Schema
-- ============================================================================
-- Creates explore_posts, explore_events, explore_saved tables with RLS,
-- compound cursor index for pagination, and like_count trigger.
-- ============================================================================

-- 1. explore_posts table
CREATE TABLE IF NOT EXISTS explore_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    caption TEXT,
    media_urls TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explore_posts_provider ON explore_posts(provider_id);
CREATE INDEX IF NOT EXISTS idx_explore_posts_status ON explore_posts(status);
CREATE INDEX IF NOT EXISTS idx_explore_posts_published_cursor ON explore_posts(published_at DESC, id DESC) WHERE status = 'published';

COMMENT ON TABLE explore_posts IS 'Provider posts for Explore feed. Media paths are in explore-posts storage bucket.';

-- 2. explore_events table (views, likes - no public INSERT, API only via service role)
CREATE TABLE IF NOT EXISTS explore_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES explore_posts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('view', 'like')),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('authed', 'anon')),
    actor_key TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(actor_type, actor_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_explore_events_post ON explore_events(post_id);
CREATE INDEX IF NOT EXISTS idx_explore_events_like_lookup ON explore_events(post_id, event_type, actor_type, actor_key) WHERE event_type = 'like';

COMMENT ON TABLE explore_events IS 'Track views and likes. Insert/delete via API only (service role). actor_key is user_id (authed) or anon_hash (anon).';

-- 3. Trigger to update like_count on explore_posts when likes are added/removed
CREATE OR REPLACE FUNCTION explore_update_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.event_type = 'like' THEN
        UPDATE explore_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' AND OLD.event_type = 'like' THEN
        UPDATE explore_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS explore_events_like_count_trigger ON explore_events;
CREATE TRIGGER explore_events_like_count_trigger
    AFTER INSERT OR DELETE ON explore_events
    FOR EACH ROW
    EXECUTE FUNCTION explore_update_like_count();

-- 4. explore_saved table (user saves - auth required)
CREATE TABLE IF NOT EXISTS explore_saved (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES explore_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_explore_saved_user ON explore_saved(user_id);
CREATE INDEX IF NOT EXISTS idx_explore_saved_post ON explore_saved(post_id);

COMMENT ON TABLE explore_saved IS 'User saved explore posts. Auth required.';

-- 5. updated_at trigger for explore_posts
DROP TRIGGER IF EXISTS explore_posts_updated_at ON explore_posts;
CREATE TRIGGER explore_posts_updated_at
    BEFORE UPDATE ON explore_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS for explore_posts
ALTER TABLE explore_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts
DROP POLICY IF EXISTS "Public can read published explore posts" ON explore_posts;
CREATE POLICY "Public can read published explore posts"
    ON explore_posts FOR SELECT
    USING (status = 'published');

-- Provider owner or staff can manage their provider's posts
DROP POLICY IF EXISTS "Providers can manage own explore posts" ON explore_posts;
CREATE POLICY "Providers can manage own explore posts"
    ON explore_posts FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff
            WHERE user_id = auth.uid() AND is_active = true
        )
    )
    WITH CHECK (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Superadmin can do everything
DROP POLICY IF EXISTS "Superadmin can manage explore posts" ON explore_posts;
CREATE POLICY "Superadmin can manage explore posts"
    ON explore_posts FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- 7. RLS for explore_events - no client policies (API uses service role)
ALTER TABLE explore_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated; service role bypasses RLS

-- 8. RLS for explore_saved
ALTER TABLE explore_saved ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own saved posts" ON explore_saved;
CREATE POLICY "Users can manage own saved posts"
    ON explore_saved FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 9. RPC for cursor-based pagination (compound cursor)
CREATE OR REPLACE FUNCTION explore_posts_list_published(
    p_cursor_published_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    provider_id UUID,
    created_by_user_id UUID,
    caption TEXT,
    media_urls TEXT[],
    status TEXT,
    published_at TIMESTAMPTZ,
    like_count INT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    provider_business_name TEXT,
    provider_slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ep.id,
        ep.provider_id,
        ep.created_by_user_id,
        ep.caption,
        ep.media_urls,
        ep.status,
        ep.published_at,
        ep.like_count,
        ep.created_at,
        ep.updated_at,
        p.business_name,
        p.slug
    FROM explore_posts ep
    JOIN providers p ON p.id = ep.provider_id
    WHERE ep.status = 'published' AND ep.is_hidden = false
    AND (
        p_cursor_published_at IS NULL
        OR (ep.published_at, ep.id) < (p_cursor_published_at, p_cursor_id)
    )
    ORDER BY ep.published_at DESC, ep.id DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
