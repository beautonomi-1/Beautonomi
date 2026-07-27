-- Beautonomi Database Migration
-- 820_bookings_referral_source_id.sql
--
-- The provider booking APIs (create POST, detail PATCH, automations) and the
-- provider app "Where did this client come from?" field all read/write
-- bookings.referral_source_id, but no migration ever added the column —
-- referral_sources itself was created in 163 without the bookings link.
-- Everything is IF NOT EXISTS / guarded so environments where the column was
-- added manually are unaffected.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS referral_source_id UUID;

-- The column already exists in environments where it was added out-of-band, so
-- it can hold ids whose referral_source has since been hard-deleted. Clear those
-- before adding the constraint, otherwise the ALTER fails on validation.
UPDATE public.bookings b
   SET referral_source_id = NULL
 WHERE b.referral_source_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.referral_sources rs WHERE rs.id = b.referral_source_id
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_referral_source_id_fkey'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_referral_source_id_fkey
      FOREIGN KEY (referral_source_id)
      REFERENCES public.referral_sources(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Automations ("first visit via source X") filter on referral_source_id IS NOT NULL.
CREATE INDEX IF NOT EXISTS idx_bookings_referral_source
  ON public.bookings(referral_source_id)
  WHERE referral_source_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.referral_source_id IS
  'Provider-defined referral source ("where did this client come from") captured at booking creation or edit.';
