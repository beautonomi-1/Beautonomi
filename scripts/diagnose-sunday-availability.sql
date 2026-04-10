-- Sunday Availability Diagnostic Script
-- Run this against the Supabase database to identify why Sunday may show as closed/unavailable
-- Copy and run each section in the Supabase SQL Editor

-- ============================================================================
-- 1. Check provider_locations working_hours for missing or closed Sunday
-- ============================================================================
SELECT
  pl.id AS location_id,
  p.business_name,
  pl.name AS location_name,
  pl.working_hours IS NULL AS wh_is_null,
  pl.working_hours = '{}'::jsonb AS wh_is_empty,
  pl.working_hours ? 'sunday' AS has_sunday_key,
  pl.working_hours->'sunday'->>'is_open' AS sunday_is_open,
  pl.working_hours->'sunday'->>'closed' AS sunday_closed,
  pl.working_hours->'sunday'->>'open_time' AS sunday_open_time,
  pl.working_hours->'sunday'->>'close_time' AS sunday_close_time,
  pl.working_hours->'sunday'->>'open' AS sunday_open_legacy,
  pl.working_hours->'sunday'->>'close' AS sunday_close_legacy,
  (SELECT count(*)::int FROM jsonb_object_keys(COALESCE(pl.working_hours, '{}'::jsonb))) AS total_day_keys
FROM provider_locations pl
JOIN providers p ON p.id = pl.provider_id
WHERE pl.is_active = true
ORDER BY p.business_name, pl.name;

-- ============================================================================
-- 2. Find locations with partial working_hours (fewer than 7 day keys)
--    These are the root cause of Sunday being treated as closed
-- ============================================================================
SELECT
  pl.id AS location_id,
  p.business_name,
  pl.name AS location_name,
  (SELECT count(*)::int FROM jsonb_object_keys(COALESCE(pl.working_hours, '{}'::jsonb))) AS day_count,
  (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(COALESCE(pl.working_hours, '{}'::jsonb)) k) AS present_days,
  CASE
    WHEN NOT (pl.working_hours ? 'sunday') THEN 'MISSING sunday key'
    WHEN pl.working_hours->'sunday'->>'is_open' = 'false' THEN 'Sunday explicitly closed (is_open=false)'
    WHEN pl.working_hours->'sunday'->>'closed' = 'true' THEN 'Sunday explicitly closed (closed=true)'
    ELSE 'Sunday present and open'
  END AS sunday_status
FROM provider_locations pl
JOIN providers p ON p.id = pl.provider_id
WHERE pl.is_active = true
  AND (
    (SELECT count(*) FROM jsonb_object_keys(COALESCE(pl.working_hours, '{}'::jsonb))) < 7
    OR NOT (pl.working_hours ? 'sunday')
    OR pl.working_hours->'sunday'->>'is_open' = 'false'
    OR pl.working_hours->'sunday'->>'closed' = 'true'
  )
ORDER BY p.business_name;

-- ============================================================================
-- 3. Check staff working hours (JSONB) for Sunday issues
-- ============================================================================
SELECT
  ps.id AS staff_id,
  ps.name AS staff_name,
  p.business_name,
  ps.work_hours_enabled,
  ps.working_hours IS NULL AS wh_is_null,
  ps.working_hours = '{}'::jsonb AS wh_is_empty,
  ps.working_hours ? 'sunday' AS has_sunday_key,
  ps.working_hours->'sunday'->>'is_open' AS sunday_is_open,
  ps.working_hours->'sunday'->>'closed' AS sunday_closed
FROM provider_staff ps
JOIN providers p ON p.id = ps.provider_id
WHERE ps.is_active = true
  AND ps.work_hours_enabled = true
  AND (
    ps.working_hours IS NOT NULL
    AND ps.working_hours != '{}'::jsonb
    AND (
      NOT (ps.working_hours ? 'sunday')
      OR ps.working_hours->'sunday'->>'is_open' = 'false'
      OR ps.working_hours->'sunday'->>'closed' = 'true'
    )
  )
ORDER BY p.business_name, ps.name;

-- ============================================================================
-- 4. Check staff_schedules for Sunday (day_of_week = 0)
--    Columns: id, staff_id, provider_id, day_of_week, start_time, end_time,
--             is_working, notes, created_at, updated_at
-- ============================================================================
SELECT
  ss.id,
  ps.name AS staff_name,
  p.business_name,
  ss.day_of_week,
  ss.is_working,
  ss.start_time,
  ss.end_time,
  ss.notes,
  ss.created_at
FROM staff_schedules ss
JOIN provider_staff ps ON ps.id = ss.staff_id
JOIN providers p ON p.id = ps.provider_id
WHERE ss.day_of_week = 0
  AND ps.is_active = true
ORDER BY p.business_name, ps.name;

-- ============================================================================
-- 5. Check staff_shifts on Sundays (date-based, DOW=0)
--    Columns: id, provider_id, staff_id, date, start_time, end_time,
--             notes, is_recurring, recurring_pattern, created_at, updated_at
-- ============================================================================
SELECT
  sh.id,
  ps.name AS staff_name,
  p.business_name,
  sh.date,
  sh.start_time,
  sh.end_time,
  sh.is_recurring,
  sh.recurring_pattern,
  sh.created_at
FROM staff_shifts sh
JOIN provider_staff ps ON ps.id = sh.staff_id
JOIN providers p ON p.id = ps.provider_id
WHERE ps.is_active = true
  AND (
    -- Shifts on actual Sundays
    EXTRACT(DOW FROM sh.date) = 0
    -- Or recurring shifts that include Sunday (day 0)
    OR (sh.is_recurring = true AND sh.recurring_pattern->'days' @> '0'::jsonb)
  )
ORDER BY p.business_name, ps.name, sh.date;

-- ============================================================================
-- 6. Check staff_days_off on upcoming Sundays
-- ============================================================================
SELECT
  sdo.id,
  ps.name AS staff_name,
  p.business_name,
  sdo.date,
  sdo.reason,
  sdo.type,
  sdo.is_approved
FROM staff_days_off sdo
JOIN provider_staff ps ON ps.id = sdo.staff_id
JOIN providers p ON p.id = sdo.provider_id
WHERE sdo.date >= CURRENT_DATE
  AND EXTRACT(DOW FROM sdo.date) = 0
  AND ps.is_active = true
ORDER BY p.business_name, sdo.date;

-- ============================================================================
-- 7a. Quick fix: Backfill missing Sunday keys in provider_locations working_hours
--     This adds Sunday as open 09:00-18:00 where it's missing from non-empty objects
--     PREVIEW FIRST:
-- ============================================================================
-- Preview what would be updated:
SELECT
  pl.id,
  p.business_name,
  pl.name,
  pl.working_hours
FROM provider_locations pl
JOIN providers p ON p.id = pl.provider_id
WHERE pl.is_active = true
  AND pl.working_hours IS NOT NULL
  AND pl.working_hours != '{}'::jsonb
  AND NOT (pl.working_hours ? 'sunday');

-- Uncomment to apply the fix:
-- UPDATE provider_locations
-- SET working_hours = working_hours || '{"sunday": {"is_open": true, "open_time": "09:00", "close_time": "18:00"}}'::jsonb,
--     updated_at = NOW()
-- WHERE is_active = true
--   AND working_hours IS NOT NULL
--   AND working_hours != '{}'::jsonb
--   AND NOT (working_hours ? 'sunday');

-- ============================================================================
-- 7b. Fix Sunday explicitly saved as closed due to Format A/B mismatch bug
--     The web OperatingHoursEditor previously used "closed" field but didn't
--     clear "is_open" from the DB spread. The normalizer checked is_open first,
--     so Sunday stayed closed even when the user toggled it open.
--     This sets is_open=true for Sunday on all locations (adjust WHERE for specific providers).
--     PREVIEW FIRST:
-- ============================================================================
-- Preview locations where Sunday is explicitly closed:
SELECT
  pl.id,
  p.business_name,
  pl.name,
  pl.working_hours->'sunday' AS sunday_data
FROM provider_locations pl
JOIN providers p ON p.id = pl.provider_id
WHERE pl.is_active = true
  AND pl.working_hours IS NOT NULL
  AND pl.working_hours ? 'sunday'
  AND (pl.working_hours->'sunday'->>'is_open' = 'false');

-- Uncomment to fix Sunday to open (uses same times if they exist, else defaults):
-- UPDATE provider_locations
-- SET working_hours = jsonb_set(
--       working_hours,
--       '{sunday,is_open}',
--       'true'::jsonb
--     ),
--     updated_at = NOW()
-- WHERE is_active = true
--   AND working_hours IS NOT NULL
--   AND working_hours ? 'sunday'
--   AND (working_hours->'sunday'->>'is_open' = 'false');

-- ============================================================================
-- 8. Backfill missing Sunday in provider_staff working_hours
-- ============================================================================
-- Preview:
SELECT
  ps.id,
  ps.name,
  p.business_name,
  ps.working_hours
FROM provider_staff ps
JOIN providers p ON p.id = ps.provider_id
WHERE ps.is_active = true
  AND ps.work_hours_enabled = true
  AND ps.working_hours IS NOT NULL
  AND ps.working_hours != '{}'::jsonb
  AND NOT (ps.working_hours ? 'sunday');

-- Uncomment to apply:
-- UPDATE provider_staff
-- SET working_hours = working_hours || '{"sunday": {"is_open": true, "open_time": "09:00", "close_time": "18:00"}}'::jsonb,
--     updated_at = NOW()
-- WHERE is_active = true
--   AND work_hours_enabled = true
--   AND working_hours IS NOT NULL
--   AND working_hours != '{}'::jsonb
--   AND NOT (working_hours ? 'sunday');

-- ============================================================================
-- 9. Summary: Overall Sunday readiness per provider
-- ============================================================================
SELECT
  p.id AS provider_id,
  p.business_name,
  CASE
    WHEN pl.working_hours IS NULL OR pl.working_hours = '{}'::jsonb THEN 'DEFAULT (open all days)'
    WHEN NOT (pl.working_hours ? 'sunday') THEN 'BROKEN - Sunday key missing'
    WHEN pl.working_hours->'sunday'->>'is_open' = 'false' OR pl.working_hours->'sunday'->>'closed' = 'true' THEN 'CLOSED - Sunday explicitly off'
    ELSE 'OPEN'
  END AS location_sunday_status,
  (SELECT count(*) FROM staff_schedules ss
   JOIN provider_staff ps2 ON ps2.id = ss.staff_id
   WHERE ps2.provider_id = p.id AND ss.day_of_week = 0 AND ss.is_working = false
   AND ps2.is_active = true) AS staff_with_sunday_off_schedule,
  (SELECT count(*) FROM provider_staff ps3
   WHERE ps3.provider_id = p.id AND ps3.is_active = true
   AND ps3.work_hours_enabled = true
   AND ps3.working_hours IS NOT NULL
   AND ps3.working_hours != '{}'::jsonb
   AND NOT (ps3.working_hours ? 'sunday')) AS staff_missing_sunday_wh,
  (SELECT count(*) FROM staff_days_off sdo
   JOIN provider_staff ps4 ON ps4.id = sdo.staff_id
   WHERE ps4.provider_id = p.id
   AND sdo.date >= CURRENT_DATE
   AND EXTRACT(DOW FROM sdo.date) = 0
   AND ps4.is_active = true) AS staff_with_upcoming_sunday_off
FROM providers p
LEFT JOIN provider_locations pl ON pl.provider_id = p.id AND pl.is_primary = true
WHERE p.status = 'active'
ORDER BY p.business_name;
