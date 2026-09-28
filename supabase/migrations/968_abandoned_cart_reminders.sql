-- Abandoned cart recovery ledger (cap per user + cart fingerprint) and template.

CREATE TABLE IF NOT EXISTS public.abandoned_cart_reminders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cart_fingerprint text NOT NULL,
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  send_count       int NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  first_sent_at    timestamptz NULL,
  last_sent_at     timestamptz NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cart_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminders_user
  ON public.abandoned_cart_reminders(user_id);

ALTER TABLE public.abandoned_cart_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandoned_cart_reminders_service_role
  ON public.abandoned_cart_reminders;

CREATE POLICY abandoned_cart_reminders_service_role
  ON public.abandoned_cart_reminders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.abandoned_cart_reminders IS
  'Tracks capped abandoned-cart recovery sends per (user_id, cart_fingerprint).';

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'abandoned_cart';

INSERT INTO public.notification_templates (
  tenant_id,
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  variables,
  url,
  enabled,
  description
)
VALUES (
  NULL,
  'abandoned_cart',
  'Still thinking it over?',
  'You left {{item_summary}} in your cart.',
  ARRAY['push', 'email']::TEXT[],
  'Still thinking it over?',
  '<p>You left <strong>{{item_summary}}</strong> in your cart.</p><p><a href="/cart">Return to cart</a></p>',
  ARRAY['item_summary', 'item_count']::TEXT[],
  '/cart',
  true,
  'Marketing recovery nudge for authenticated customers with idle cart items (max 2 sends per cart fingerprint).'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();
