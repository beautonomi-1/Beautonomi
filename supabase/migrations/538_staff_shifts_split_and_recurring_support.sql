-- 538_staff_shifts_split_and_recurring_support.sql
-- Staff can have split shifts on the same date, and recurring shift anchors
-- may share dates with date-specific overrides. The app already renders an
-- array of shifts per staff/day, so keep lookup performance without enforcing
-- one row per staff/date.

ALTER TABLE public.staff_shifts
  DROP CONSTRAINT IF EXISTS staff_shifts_staff_id_date_key;

CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_date
  ON public.staff_shifts(staff_id, date);
