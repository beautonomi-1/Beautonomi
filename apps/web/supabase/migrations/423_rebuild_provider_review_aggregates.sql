-- Rebuild provider review aggregates from canonical reviews table data.
-- Uses public visibility rules and resets stale drifted counters.

WITH review_agg AS (
  SELECT
    provider_id,
    COALESCE(AVG(rating), 0)::numeric(3,2) AS avg_rating,
    COUNT(*)::integer AS review_count
  FROM reviews
  WHERE is_visible = true
  GROUP BY provider_id
)
UPDATE providers p
SET
  rating_average = ra.avg_rating,
  review_count = ra.review_count
FROM review_agg ra
WHERE p.id = ra.provider_id;

-- Providers with no visible reviews should surface zeroed aggregates.
UPDATE providers
SET
  rating_average = 0,
  review_count = 0
WHERE id NOT IN (
  SELECT DISTINCT provider_id
  FROM reviews
  WHERE is_visible = true
);
