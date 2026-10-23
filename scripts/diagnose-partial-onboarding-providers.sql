-- Partial provider onboarding audit (read-only)
-- Providers created before rollback hardening may exist without a location and/or cancellation policy.
-- Run in Supabase SQL Editor (staging or production). Fix matches manually; do not auto-delete rows.

SELECT
  p.id,
  p.business_name,
  p.created_at,
  p.status,
  l.id IS NULL AS missing_location,
  c.id IS NULL AS missing_cancellation_policy
FROM providers p
LEFT JOIN provider_locations l ON l.provider_id = p.id
LEFT JOIN cancellation_policies c ON c.provider_id = p.id
WHERE l.id IS NULL OR c.id IS NULL
ORDER BY p.created_at DESC;
