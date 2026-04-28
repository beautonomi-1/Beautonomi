-- Make provider-created recurring series manageable and finite when requested.
-- `occurrences` is the intended total number of generated visits including the
-- first visit. Cron uses it to avoid creating appointments forever when the
-- provider chose "number of occurrences" instead of an end date.

ALTER TABLE public.recurring_appointments
  ADD COLUMN IF NOT EXISTS occurrences INTEGER;

ALTER TABLE public.recurring_appointments
  DROP CONSTRAINT IF EXISTS recurring_appointments_occurrences_check;

ALTER TABLE public.recurring_appointments
  ADD CONSTRAINT recurring_appointments_occurrences_check
  CHECK (occurrences IS NULL OR occurrences > 0);

COMMENT ON COLUMN public.recurring_appointments.occurrences IS
  'Optional total number of visits to generate for this recurring series, including the first visit.';
