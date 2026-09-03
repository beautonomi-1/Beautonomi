-- Part D/E: ads moderation + notifications columns, subscription trial/dunning/downgrade, realtime, templates.

-- ─── Ads campaigns: moderation + notification dedup ───────────────────────────
ALTER TABLE public.ads_campaigns
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS budget_low_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_exhausted_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_ended_notified_at timestamptz;

ALTER TABLE public.ads_campaigns DROP CONSTRAINT IF EXISTS ads_campaigns_status_check;
ALTER TABLE public.ads_campaigns
  ADD CONSTRAINT ads_campaigns_status_check
  CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'ended', 'rejected'));

COMMENT ON COLUMN public.ads_campaigns.rejection_reason IS 'Set when status=rejected after admin moderation.';
COMMENT ON COLUMN public.ads_campaigns.budget_low_notified_at IS 'Dedup gate for 80% budget-low notification.';

-- ─── Ads budget orders: alternate payment rails ───────────────────────────────
ALTER TABLE public.ads_budget_orders
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.ads_budget_orders DROP CONSTRAINT IF EXISTS ads_budget_orders_payment_method_check;
ALTER TABLE public.ads_budget_orders
  ADD CONSTRAINT ads_budget_orders_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('paystack', 'apple', 'saved_card', 'marketing_credit')
  );

-- ─── Provider subscriptions: trial, scheduled downgrade, dunning ────────────
ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_retry_at timestamptz;

COMMENT ON COLUMN public.provider_subscriptions.trial_ends_at IS 'When trialing status should convert to paid or lapse.';
COMMENT ON COLUMN public.provider_subscriptions.scheduled_plan_id IS 'Paid-to-paid downgrade applied at scheduled_change_at (no proration).';

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_trial_ends
  ON public.provider_subscriptions (trial_ends_at)
  WHERE status = 'trialing' AND trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_scheduled_change
  ON public.provider_subscriptions (scheduled_change_at)
  WHERE scheduled_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_past_due_dunning
  ON public.provider_subscriptions (status, last_dunning_retry_at)
  WHERE status = 'past_due';

-- ─── Realtime publication ─────────────────────────────────────────────────────
ALTER TABLE public.ads_campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.provider_subscriptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ads_campaigns'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_campaigns;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'provider_subscriptions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_subscriptions;
    END IF;
  END IF;
END $$;

-- ─── Notification templates (ads + subscription gaps) ─────────────────────────
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_budget_exhausted',
  'Ad budget used up',
  'Your ad campaign has used its full budget and is no longer showing in sponsored slots. Top up or create a new campaign to keep promoting.',
  'Ad budget exhausted',
  '<p>Your ad campaign has used its full budget and has been paused from sponsored slots.</p><p><a href="{{app_url}}/provider/settings/ads">Manage ads</a></p>',
  'Your Beautonomi ad campaign budget is used up. Open the app to add funds.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'campaign_id', 'app_url'],
  TRUE,
  'Provider ad campaign budget fully spent.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_budget_exhausted');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_campaign_ended',
  'Ad campaign ended',
  'Your ad campaign has ended{{#reason}} ({{reason}}){{/reason}}. Unused budget may be refunded for CPC and pack campaigns.',
  'Ad campaign ended',
  '<p>Your ad campaign has ended.</p><p><a href="{{app_url}}/provider/settings/ads">View campaigns</a></p>',
  'Your Beautonomi ad campaign has ended.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'campaign_id', 'reason', 'app_url'],
  TRUE,
  'Provider ad campaign reached end date or was ended.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_campaign_ended');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_campaign_paused_by_admin',
  'Ad campaign paused',
  'Your ad campaign was paused by Beautonomi{{#reason}}: {{reason}}{{/reason}}. Contact support if you have questions.',
  'Ad campaign paused',
  '<p>Your ad campaign was paused by our team.</p>{{#reason}}<p>Reason: {{reason}}</p>{{/reason}}',
  'Your Beautonomi ad campaign was paused. Check the provider app for details.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'campaign_id', 'reason', 'app_url'],
  TRUE,
  'Admin paused a provider ad campaign.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_campaign_paused_by_admin');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_budget_low',
  'Ad budget running low',
  'Your ad campaign has used about {{percent_used}}% of its budget. Add funds before it stops showing.',
  'Ad budget running low',
  '<p>Your campaign is at {{percent_used}}% of its budget.</p>',
  'Beautonomi ad budget is {{percent_used}}% used. Top up soon.',
  ARRAY['push'],
  ARRAY['business_name', 'campaign_id', 'percent_used', 'app_url'],
  TRUE,
  'Provider ad campaign crossed 80% spend.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_budget_low');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_campaign_approved',
  'Ad campaign approved',
  'Your ad campaign was approved and is now live in sponsored slots.',
  'Ad campaign approved',
  '<p>Your ad campaign is approved and active.</p>',
  'Your Beautonomi ad campaign is approved and live.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'campaign_id', 'app_url'],
  TRUE,
  'Admin approved a pending_review ad campaign.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_campaign_approved');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'ads_campaign_rejected',
  'Ad campaign not approved',
  'Your ad campaign was not approved{{#reason}}: {{reason}}{{/reason}}. Edit and resubmit, or contact support.',
  'Ad campaign not approved',
  '<p>Your ad campaign was not approved.</p>{{#reason}}<p>Reason: {{reason}}</p>{{/reason}}',
  'Your Beautonomi ad was not approved. Open the app to edit and resubmit.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'campaign_id', 'reason', 'app_url'],
  TRUE,
  'Admin rejected a pending_review ad campaign; budget refunded.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'ads_campaign_rejected');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_payment_failed',
  'Subscription payment failed',
  'We could not renew your subscription. Update your payment method within {{grace_days}} days to keep premium features.',
  'Subscription payment failed',
  '<p>Your subscription renewal payment failed. Please update your payment method.</p>',
  'Beautonomi subscription payment failed. Update your card in the app.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'grace_days', 'app_url'],
  TRUE,
  'Provider subscription renewal charge failed.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_payment_failed');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_expiring',
  'Subscription expiring soon',
  'Your subscription expires in {{days_until}} day(s). Renew to keep your premium features.',
  'Subscription expiring soon',
  '<p>Your subscription expires on {{expires_at}}.</p>',
  'Beautonomi subscription expires in {{days_until}} days.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'days_until', 'expires_at', 'plan_name', 'app_url'],
  TRUE,
  'Provider subscription nearing expiry.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_expiring');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_expired',
  'Subscription expired',
  'Your subscription has expired. Renew to restore premium features.',
  'Subscription expired',
  '<p>Your subscription has expired.</p>',
  'Your Beautonomi subscription has expired.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'reason', 'app_url'],
  TRUE,
  'Provider subscription lapsed to free/expired.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_expired');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_trial_ending',
  'Trial ending soon',
  'Your free trial ends in {{days_until}} day(s). Add a payment method to continue on {{plan_name}}.',
  'Trial ending soon',
  '<p>Your trial ends on {{trial_ends_at}}.</p>',
  'Beautonomi trial ends in {{days_until}} days.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'days_until', 'trial_ends_at', 'plan_name', 'app_url'],
  TRUE,
  'Provider subscription trial ending (3/1 day reminders).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_trial_ending');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_card_expiring',
  'Card expiring soon',
  'The card on file for your subscription expires soon. Update it to avoid interruption.',
  'Update your subscription card',
  '<p>Your saved card is expiring soon.</p>',
  'Update your Beautonomi subscription card before it expires.',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'app_url'],
  TRUE,
  'Provider subscription card expiring reminder.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_card_expiring');
