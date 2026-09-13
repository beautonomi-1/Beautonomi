-- Booking lifecycle: provider settings + running-late / close-out fields

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS confirmation_sla_hours integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS unconfirmed_expire_hours_before_slot integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS closeout_grace_minutes_salon integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS closeout_grace_minutes_at_home integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS late_arrival_grace_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.providers.confirmation_sla_hours IS
  'Business-hours SLA for confirming customer online booking requests.';
COMMENT ON COLUMN public.providers.unconfirmed_expire_hours_before_slot IS
  'Release unconfirmed online requests this many hours before scheduled_at.';
COMMENT ON COLUMN public.providers.closeout_grace_minutes_salon IS
  'Minutes after service end before salon bookings appear in close-out queue.';
COMMENT ON COLUMN public.providers.closeout_grace_minutes_at_home IS
  'Minutes after service end before at-home bookings appear in close-out queue.';
COMMENT ON COLUMN public.providers.late_arrival_grace_minutes IS
  'Optional provider-configured late arrival grace (informational; close-out uses closeout grace).';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_running_late_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_running_late_minutes integer,
  ADD COLUMN IF NOT EXISTS provider_late_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_attempts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bookings.customer_running_late_at IS
  'When the customer reported they are running late.';
COMMENT ON COLUMN public.bookings.customer_running_late_minutes IS
  'Customer-reported delay in minutes.';
COMMENT ON COLUMN public.bookings.provider_late_ack_at IS
  'When the provider acknowledged a customer running-late report.';
COMMENT ON COLUMN public.bookings.contact_attempts IS
  'At-home close-out contact attempts before marking no-show.';

-- Provider-created pending rows should not linger under manual confirm.
UPDATE public.bookings
SET status = 'confirmed',
    updated_at = now()
WHERE status = 'pending'
  AND booking_source IN ('provider', 'walk_in')
  AND scheduled_at > now();

-- Notification templates for lifecycle flows (idempotent)
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'provider_closeout_reminder',
  'Unclosed appointments',
  'You have {{count}} appointments still open. Close them out to keep reports accurate.',
  ARRAY['push', 'email']::TEXT[],
  ARRAY['count']::TEXT[],
  '/provider/bookings?filter=close_out',
  true,
  'Morning reminder when confirmed appointments need close-out'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'provider_closeout_reminder');

INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'provider_booking_request_reminder',
  'Booking request expiring soon',
  '{{customer_name}} requested {{service_name}} on {{date}} at {{time}}. Confirm or decline before {{expire_time}}.',
  ARRAY['push']::TEXT[],
  ARRAY['customer_name', 'service_name', 'date', 'time', 'expire_time', 'booking_id']::TEXT[],
  '/provider/bookings?filter=pending',
  true,
  'Reminder before an unconfirmed online request expires'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'provider_booking_request_reminder');

INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'customer_running_late_ack',
  'Salon is waiting for you',
  '{{provider_name}} says: no problem, see you around {{adjusted_time}}.',
  ARRAY['push']::TEXT[],
  ARRAY['provider_name', 'adjusted_time', 'booking_id']::TEXT[],
  '/account-settings/bookings/{{booking_id}}',
  true,
  'Customer notified when provider acknowledges running-late report'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'customer_running_late_ack');

INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'booking_checkout_not_completed',
  'Your booking wasn''t completed',
  'Your booking with {{provider_name}} for {{booking_date}} at {{booking_time}} wasn''t completed, so the time is free again. Tap to rebook.',
  ARRAY['push', 'email']::TEXT[],
  ARRAY['provider_name', 'provider_slug', 'booking_date', 'booking_time', 'services', 'booking_id']::TEXT[],
  '/partner-profile?slug={{provider_slug}}',
  true,
  'Customer abandoned card checkout; pending_payment row released by cron. No charge was taken.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'booking_checkout_not_completed');

-- Lifecycle §L/§R: no-show notice must offer a one-tap path to dispute a mistaken mark.
UPDATE public.notification_templates
SET body = 'You missed your appointment with {{provider_name}} on {{booking_date}} at {{booking_time}}. A no-show fee of {{no_show_fee}} may apply. Think this is a mistake? Open the booking to contact the salon or report it.',
    url = '/account-settings/bookings/{{booking_id}}',
    updated_at = NOW()
WHERE key = 'customer_no_show';

INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'provider_customer_running_late',
  'Customer running late',
  '{{customer_name}} is running {{delay_minutes}} min late for {{service_name}} at {{time}}.',
  ARRAY['push']::TEXT[],
  ARRAY['customer_name', 'delay_minutes', 'service_name', 'time', 'booking_id']::TEXT[],
  '/provider/bookings/{{booking_id}}',
  true,
  'Provider team notified when customer reports running late'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'provider_customer_running_late');
