-- WhatsApp notification channel, Content template sync columns, inbound/delivery logs,
-- and provider marketing credits ledger.

-- ---------------------------------------------------------------------------
-- 1. Extend notification_delivery_queue channel
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_delivery_queue
  DROP CONSTRAINT IF EXISTS notification_delivery_queue_channel_check;

ALTER TABLE public.notification_delivery_queue
  ADD CONSTRAINT notification_delivery_queue_channel_check
  CHECK (channel IN ('email', 'push', 'sms', 'in_app', 'whatsapp'));

-- ---------------------------------------------------------------------------
-- 2. Extend notification_templates (whatsapp channel + Content API fields)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS valid_channels;

ALTER TABLE public.notification_templates
  ADD CONSTRAINT valid_channels CHECK (
    channels <@ ARRAY['push', 'email', 'sms', 'live_activities', 'whatsapp']::TEXT[]
  );

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS whatsapp_content_sid text,
  ADD COLUMN IF NOT EXISTS whatsapp_content_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_category text NOT NULL DEFAULT 'utility',
  ADD COLUMN IF NOT EXISTS whatsapp_template_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS whatsapp_body text,
  ADD COLUMN IF NOT EXISTS channel_waterfall jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_approval_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS whatsapp_content_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_content_hash text,
  ADD COLUMN IF NOT EXISTS whatsapp_content_error text,
  ADD COLUMN IF NOT EXISTS whatsapp_content_type text NOT NULL DEFAULT 'twilio/text',
  ADD COLUMN IF NOT EXISTS whatsapp_content_definition jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_whatsapp_category_check'
  ) THEN
    ALTER TABLE public.notification_templates
      ADD CONSTRAINT notification_templates_whatsapp_category_check
      CHECK (whatsapp_category IN ('authentication', 'utility', 'marketing'));
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. User WhatsApp prefs / opt-in
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text;

-- ---------------------------------------------------------------------------
-- 4. WhatsApp inbound sessions (24h window)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  phone text NOT NULL,
  last_inbound_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_inbound_sessions_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_inbound_sessions_user
  ON public.whatsapp_inbound_sessions (user_id)
  WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_whatsapp_inbound_sessions_updated_at ON public.whatsapp_inbound_sessions;
CREATE TRIGGER update_whatsapp_inbound_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_inbound_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.whatsapp_inbound_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_inbound_sessions_service ON public.whatsapp_inbound_sessions;
CREATE POLICY whatsapp_inbound_sessions_service ON public.whatsapp_inbound_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. WhatsApp delivery log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid text NOT NULL,
  queue_row_id uuid REFERENCES public.notification_delivery_queue(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  template_key text,
  content_sid text,
  status text NOT NULL DEFAULT 'queued',
  error_code text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_delivery_log_message_sid_unique UNIQUE (message_sid)
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_delivery_log_queue
  ON public.whatsapp_delivery_log (queue_row_id)
  WHERE queue_row_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_whatsapp_delivery_log_updated_at ON public.whatsapp_delivery_log;
CREATE TRIGGER update_whatsapp_delivery_log_updated_at
  BEFORE UPDATE ON public.whatsapp_delivery_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.whatsapp_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_delivery_log_service ON public.whatsapp_delivery_log;
CREATE POLICY whatsapp_delivery_log_service ON public.whatsapp_delivery_log
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. Marketing credits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_marketing_credits (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  included_balance_zar numeric(12, 2) NOT NULL DEFAULT 0,
  purchased_balance_zar numeric(12, 2) NOT NULL DEFAULT 0,
  included_grant_zar numeric(12, 2) NOT NULL DEFAULT 0,
  period_start date NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_provider_marketing_credits_updated_at ON public.provider_marketing_credits;
CREATE TRIGGER update_provider_marketing_credits_updated_at
  BEFORE UPDATE ON public.provider_marketing_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.provider_marketing_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_marketing_credits_service ON public.provider_marketing_credits;
CREATE POLICY provider_marketing_credits_service ON public.provider_marketing_credits
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.marketing_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  delta_zar numeric(12, 2) NOT NULL,
  reason text NOT NULL CHECK (
    reason IN (
      'monthly_grant',
      'topup',
      'campaign_send',
      'automation_send',
      'admin_adjustment',
      'refund'
    )
  ),
  channel text,
  category text,
  campaign_id uuid,
  queue_row_id uuid,
  idempotency_key text,
  balance_after numeric(12, 2) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_credit_ledger_idempotency
  ON public.marketing_credit_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_marketing_credit_ledger_provider
  ON public.marketing_credit_ledger (provider_id, created_at DESC);

ALTER TABLE public.marketing_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_credit_ledger_service ON public.marketing_credit_ledger;
CREATE POLICY marketing_credit_ledger_service ON public.marketing_credit_ledger
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.marketing_channel_pricebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  category text NOT NULL DEFAULT 'default',
  unit_cost_zar numeric(12, 4) NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_channel_pricebook_unique UNIQUE (channel, category)
);

DROP TRIGGER IF EXISTS update_marketing_channel_pricebook_updated_at ON public.marketing_channel_pricebook;
CREATE TRIGGER update_marketing_channel_pricebook_updated_at
  BEFORE UPDATE ON public.marketing_channel_pricebook
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.marketing_channel_pricebook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_channel_pricebook_service ON public.marketing_channel_pricebook;
CREATE POLICY marketing_channel_pricebook_service ON public.marketing_channel_pricebook
  FOR ALL USING (auth.role() = 'service_role');

INSERT INTO public.marketing_channel_pricebook (channel, category, unit_cost_zar, description)
VALUES
  ('whatsapp', 'marketing', 0.85, 'WhatsApp marketing conversation (ZAR estimate)'),
  ('whatsapp', 'utility', 0.35, 'WhatsApp utility conversation (ZAR estimate)'),
  ('whatsapp', 'authentication', 0.25, 'WhatsApp authentication conversation (ZAR estimate)'),
  ('sms', 'default', 0.35, 'SMS segment (ZAR estimate)'),
  ('email', 'default', 0.05, 'Transactional/marketing email (ZAR estimate)')
ON CONFLICT (channel, category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Seed WhatsApp-capable transactional templates (global rows)
-- ---------------------------------------------------------------------------
UPDATE public.notification_templates t
SET
  channels = (
    SELECT array_agg(DISTINCT ch)
    FROM unnest(t.channels || ARRAY['whatsapp']::text[]) AS ch
  ),
  whatsapp_body = COALESCE(t.whatsapp_body, t.sms_body, t.body),
  whatsapp_category = 'utility',
  whatsapp_approval_name = COALESCE(
    t.whatsapp_approval_name,
    regexp_replace(lower(t.key), '[^a-z0-9]+', '_', 'g')
  ),
  whatsapp_content_variables = CASE
    WHEN t.whatsapp_content_variables IS NULL
      OR t.whatsapp_content_variables = '[]'::jsonb
    THEN (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('ordinal', ord, 'var', v)
          ORDER BY ord
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT row_number() OVER ()::int AS ord, unnest(t.variables) AS v
      ) vars
    )
    ELSE t.whatsapp_content_variables
  END,
  channel_waterfall = CASE
    WHEN t.channel_waterfall IS NULL OR t.channel_waterfall = '[]'::jsonb
    THEN '["whatsapp","sms","email"]'::jsonb
    ELSE t.channel_waterfall
  END
WHERE t.tenant_id IS NULL
  AND t.key IN (
    'booking_confirmed',
    'booking_reminder_24h',
    'booking_reminder_2h',
    'booking_cancelled',
    'provider_booking_request',
    'payment_received',
    'appointment_reminder',
    'booking_rescheduled'
  );

-- Growth plan: use platform credentials for marketing
UPDATE public.subscription_plans sp
SET features = jsonb_set(
  COALESCE(sp.features, '{}'::jsonb),
  '{marketing_campaigns,use_platform_credentials}',
  'true'::jsonb,
  true
)
WHERE sp.slug IN ('growth', 'beautonomi-growth')
  AND (sp.features->'marketing_campaigns'->>'use_platform_credentials') IS NULL;
