-- Migration 411: Fix booking_addons.addon_id FK and add cached addon_name column
--
-- Background:
--   Migration 004 created service_addons as a TABLE.
--   Migration 005 created booking_addons.addon_id → service_addons(id) FK.
--   Migration 081 dropped the service_addons TABLE (CASCADE) and replaced it with
--   a VIEW over offerings WHERE service_type = 'addon'. The CASCADE drop also
--   destroyed the booking_addons_addon_id_fkey constraint, leaving booking_addons.addon_id
--   as a plain UUID column with no FK.
--
-- This migration:
--   1. Adds a proper FK from booking_addons.addon_id → offerings(id) (the real base table).
--   2. Adds an addon_name column to cache the addon name, avoiding joins at query time.

-- ============================================================
-- 1. Add FK: booking_addons.addon_id → offerings(id)
--    (safe: only adds if the constraint does not already exist)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
    WHERE  tc.table_schema = 'public'
    AND    tc.table_name   = 'booking_addons'
    AND    kcu.column_name = 'addon_id'
    AND    tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.booking_addons
      ADD CONSTRAINT booking_addons_addon_id_fkey
      FOREIGN KEY (addon_id) REFERENCES public.offerings(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- 2. Add cached addon_name column
-- ============================================================
ALTER TABLE public.booking_addons
  ADD COLUMN IF NOT EXISTS addon_name TEXT;

-- Back-fill from offerings for existing rows where addon_name is missing
UPDATE public.booking_addons ba
SET    addon_name = o.title
FROM   public.offerings o
WHERE  ba.addon_id = o.id
AND    ba.addon_name IS NULL;

-- ============================================================
-- 3. Index
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_booking_addons_addon_id
  ON public.booking_addons(addon_id);
