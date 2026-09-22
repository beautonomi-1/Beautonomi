-- Customer WhatsApp journey: consent, inbound, retention, template seeds, feature flags

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;

COMMENT ON COLUMN public.users.whatsapp_opted_out_at IS
  'Explicit STOP/opt-out for all WhatsApp on this user (customer + provider product).';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_rsvp_at timestamptz;

COMMENT ON COLUMN public.bookings.customer_rsvp_at IS
  'When the customer confirmed attendance (WhatsApp quick-reply or app).';

CREATE TABLE IF NOT EXISTS public.whatsapp_customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  twilio_sid text,
  body text,
  button_id text,
  template_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_customer_messages_twilio_sid_unique UNIQUE (twilio_sid)
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_customer_messages_phone_created
  ON public.whatsapp_customer_messages (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_whatsapp_customer_messages_booking
  ON public.whatsapp_customer_messages (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.whatsapp_customer_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_customer_messages_service ON public.whatsapp_customer_messages;
CREATE POLICY whatsapp_customer_messages_service ON public.whatsapp_customer_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.whatsapp_button_intents (
  id text PRIMARY KEY,
  action text NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_button_intents_booking
  ON public.whatsapp_button_intents (booking_id, expires_at DESC);

ALTER TABLE public.whatsapp_button_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_button_intents_service ON public.whatsapp_button_intents;
CREATE POLICY whatsapp_button_intents_service ON public.whatsapp_button_intents
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.whatsapp_retention_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_retention_sends_user_sent
  ON public.whatsapp_retention_sends (user_id, sent_at DESC);

ALTER TABLE public.whatsapp_retention_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_retention_sends_service ON public.whatsapp_retention_sends;
CREATE POLICY whatsapp_retention_sends_service ON public.whatsapp_retention_sends
  FOR ALL USING (auth.role() = 'service_role');

-- Feature flags (disabled by default)
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'customer_whatsapp_journey',
  'Customer WhatsApp journey',
  'WhatsApp tickets, reminders, inbound RSVP, and retention for customers/guests.',
  false,
  'notifications'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'customer_whatsapp_journey' AND tenant_id IS NULL
);

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'provider_whatsapp_journey',
  'Provider WhatsApp pager',
  'Owner-only high-value WhatsApp alerts that open the provider app.',
  false,
  'notifications'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'provider_whatsapp_journey' AND tenant_id IS NULL
);

-- Seed whatsapp channel + waterfall on journey templates (global rows)
UPDATE public.notification_templates t
SET
  channels = (
    SELECT array_agg(DISTINCT ch)
    FROM unnest(t.channels || ARRAY['whatsapp']::text[]) AS ch
  ),
  whatsapp_body = COALESCE(t.whatsapp_body, t.sms_body, t.body),
  whatsapp_category = COALESCE(NULLIF(t.whatsapp_category, ''), 'utility'),
  channel_waterfall = CASE
    WHEN t.channel_waterfall IS NULL OR t.channel_waterfall = '[]'::jsonb
    THEN '["whatsapp","sms","email"]'::jsonb
    ELSE t.channel_waterfall
  END
WHERE t.tenant_id IS NULL
  AND t.key IN (
    'guest_booking_link',
    'guest_arrival_verification',
    'account_claim_invite',
    'rebook_reminder',
    'review_reminder',
    'loyalty_points_earned',
    'payment_pending',
    'additional_charge_requested',
    'provider_en_route_home',
    'provider_arriving_soon_home',
    'provider_arrived_home',
    'salon_directions',
    'provider_payout_processed',
    'provider_payout_failed',
    'provider_new_review',
    'provider_customer_running_late',
    'provider_booking_cancelled',
    'provider_booking_rescheduled',
    'service_completed',
    'walk_in_app_nudge',
    'post_visit_whatsapp'
  );
