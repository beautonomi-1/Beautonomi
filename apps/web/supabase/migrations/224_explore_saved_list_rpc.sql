-- ============================================================================
-- Migration 224: Explore Saved List RPC
-- ============================================================================
-- RPC for cursor-based pagination of saved posts.
-- ============================================================================

CREATE OR REPLACE FUNCTION explore_saved_list(
    p_user_id UUID,
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
    FROM explore_saved es
    JOIN explore_posts ep ON ep.id = es.post_id
    JOIN providers p ON p.id = ep.provider_id
    WHERE es.user_id = p_user_id
    AND ep.status = 'published' AND ep.is_hidden = false
    AND (
        p_cursor_published_at IS NULL
        OR (ep.published_at, ep.id) < (p_cursor_published_at, p_cursor_id)
    )
    ORDER BY ep.published_at DESC, ep.id DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
