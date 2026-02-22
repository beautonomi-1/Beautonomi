-- Migration 256: RPC to get view counts per post for explore_posts (mine) API
-- Fixes wrong metrics: previously the API selected all view rows (limited by PostgREST default)
-- and counted in JS; this aggregates in DB so counts are correct.

CREATE OR REPLACE FUNCTION get_explore_view_counts(post_ids uuid[])
RETURNS TABLE(post_id uuid, view_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT ee.post_id, COUNT(*)::bigint
  FROM explore_events ee
  WHERE ee.event_type = 'view'
    AND ee.post_id = ANY(post_ids)
  GROUP BY ee.post_id;
$$;

COMMENT ON FUNCTION get_explore_view_counts(uuid[]) IS 'Returns view count per post for given post IDs. Used by GET /api/explore/posts/mine for correct metrics.';
