-- Post-visit rebook offers (lock next visit): optional 24h hold + tracked send.

ALTER TABLE public.provider_online_booking_settings
  ADD COLUMN IF NOT EXISTS team_members_rebook_whatsapp_handoff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.provider_online_booking_settings.team_members_rebook_whatsapp_handoff IS
  'When true, salon employees with view_clients may hand off rebook WhatsApp from their own device.';

CREATE TABLE IF NOT EXISTS public.rebook_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  hold_id uuid REFERENCES public.booking_holds(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'handed_to_whatsapp',
      'sent',
      'opened',
      'booked',
      'expired',
      'cancelled'
    )),
  channel text,
  message_body text NOT NULL,
  link text NOT NULL,
  sent_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  opened_at timestamptz,
  booked_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  resulting_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rebook_offers_source_booking
  ON public.rebook_offers (source_booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rebook_offers_hold
  ON public.rebook_offers (hold_id)
  WHERE hold_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rebook_offers_provider_status
  ON public.rebook_offers (provider_id, status);

ALTER TABLE public.rebook_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY rebook_offers_provider_read ON public.rebook_offers
  FOR SELECT
  USING (
    provider_id IN (
      SELECT ps.provider_id FROM public.provider_staff ps WHERE ps.user_id = auth.uid()
    )
    OR provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid())
  );

CREATE POLICY rebook_offers_service_role ON public.rebook_offers
  FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'rebook_offer',
  'Time to book again',
  '{{message_body}}',
  'Your next visit with {{business_name}}',
  '<p>{{message_body}}</p>',
  '{{message_body}}',
  ARRAY['push', 'email', 'sms']::text[],
  ARRAY['message_body', 'business_name', 'link', 'customer_first_name']::text[],
  true,
  'Provider-initiated post-visit rebook (marketing / inspiration_and_offers).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates WHERE key = 'rebook_offer'
);