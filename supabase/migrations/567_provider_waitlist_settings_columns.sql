-- Columns for GET/PATCH /api/provider/settings/waitlist, public waitlist, and waitlist auto-booking.
-- Without these, PostgREST returns 42703 and the provider waitlist settings page fails to load.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_intelligent_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_auto_notify BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_notify_priority_first BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_notification_delay_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_client_self_checkin BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_online_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_max_size INTEGER NOT NULL DEFAULT 50;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_auto_remove_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_virtual_room_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_show_estimated_time BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS waitlist_auto_booking_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.waitlist_intelligent_enabled IS 'Provider portal: intelligent waitlist / auto-match notifications.';
COMMENT ON COLUMN public.providers.waitlist_auto_booking_enabled IS 'When true, matching slots may auto-create bookings for waitlist entries (see lib/waitlist/auto-booking).';
