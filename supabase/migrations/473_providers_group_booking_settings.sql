-- Columns for GET/PATCH /api/provider/settings/group-bookings and public group-booking policy.
-- Without these, PostgREST returns 42703 and the route responds 500.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS group_booking_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS online_group_booking_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS max_group_size INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS group_booking_locations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS group_booking_excluded_services JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.providers.group_booking_enabled IS 'When true, staff can create and manage group appointments from the calendar.';
COMMENT ON COLUMN public.providers.online_group_booking_enabled IS 'When true, clients can book group appointments online (subject to location/service rules).';
COMMENT ON COLUMN public.providers.max_group_size IS 'Max participants for online group booking; API enforces 2–10.';
COMMENT ON COLUMN public.providers.group_booking_locations IS 'JSON array of provider_location UUIDs enabled for online group booking.';
COMMENT ON COLUMN public.providers.group_booking_excluded_services IS 'JSON array of offering UUIDs excluded from online group booking.';
