-- Prevent cron/retry races from creating more than one booking for the same
-- recurring series occurrence. If historical duplicates exist, the migration
-- leaves the index unapplied so finance/ops can reconcile those rows first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE recurring_series_id IS NOT NULL
    GROUP BY recurring_series_id, scheduled_at
    HAVING COUNT(*) > 1
    LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_recurring_series_occurrence_unique
      ON public.bookings (recurring_series_id, scheduled_at)
      WHERE recurring_series_id IS NOT NULL;
    COMMENT ON INDEX public.idx_bookings_recurring_series_occurrence_unique IS
      'One booking per recurring series occurrence timestamp; protects cron retries from duplicate visits.';
  ELSE
    RAISE NOTICE
      'Skipped idx_bookings_recurring_series_occurrence_unique because duplicate recurring occurrences already exist.';
  END IF;
END $$;
