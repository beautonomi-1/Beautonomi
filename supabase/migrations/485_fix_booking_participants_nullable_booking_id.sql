-- 485_fix_booking_participants_nullable_booking_id.sql
-- Allow booking_participants to exist without a linked booking row.
-- Portal-created group booking participants are added directly to the
-- group_bookings flow and may not have individual bookings yet.

ALTER TABLE public.booking_participants
  ALTER COLUMN booking_id DROP NOT NULL;

-- Drop the existing unique constraint on booking_id (it prevents multiple
-- NULL rows in Postgres < 15, and conceptually participants without a booking
-- should not be constrained by it).
ALTER TABLE public.booking_participants
  DROP CONSTRAINT IF EXISTS booking_participants_booking_id_key;

-- Re-add a partial unique so that non-null booking_ids remain unique
CREATE UNIQUE INDEX IF NOT EXISTS booking_participants_booking_id_unique
  ON public.booking_participants (booking_id)
  WHERE booking_id IS NOT NULL;

-- Add service/pricing columns so each participant can have their own service selection
ALTER TABLE public.booking_participants
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.offerings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.booking_participants.service_id IS 'Per-participant service selection (offering).';
COMMENT ON COLUMN public.booking_participants.addons IS 'JSON array of addon selections [{id, name, price, duration}].';
