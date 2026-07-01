-- Migration 717: Membership recurring billing
-- Adds platform-managed auto-billing columns to user_memberships and seeds
-- notification templates for the new dunning / renewal flows.

-- 1. Add recurring billing columns to user_memberships
ALTER TABLE user_memberships
  ADD COLUMN IF NOT EXISTS auto_renew          BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_id   UUID         REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paystack_authorization_code TEXT,
  ADD COLUMN IF NOT EXISTS next_billing_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period      TEXT         NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS renewal_failure_count INT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS past_due_since      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurring_consent_at TIMESTAMPTZ;

-- 2. Widen status CHECK to include 'past_due'
--    Drop the old constraint (name from migration 026) and recreate.
DO $$
BEGIN
  ALTER TABLE user_memberships
    DROP CONSTRAINT IF EXISTS user_memberships_status_check;
  ALTER TABLE user_memberships
    ADD CONSTRAINT user_memberships_status_check
    CHECK (status IN ('active', 'cancelled', 'expired', 'past_due'));
END $$;

-- 3. Partial index for the renewal cron (fast daily scan)
CREATE INDEX IF NOT EXISTS idx_user_memberships_renewal_due
  ON user_memberships (next_billing_at)
  WHERE auto_renew = true AND status IN ('active', 'past_due');

-- 4. Seed notification templates (idempotent – WHERE NOT EXISTS + UPDATE pattern)

-- membership_payment_failed
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'membership_payment_failed',
  'Membership payment failed',
  'We could not charge your card for your {{membership_name}} membership at {{provider_name}}. Please update your payment method to keep your benefits.',
  ARRAY['push']::TEXT[],
  ARRAY['membership_name', 'provider_name']::TEXT[],
  '/account-settings/membership',
  true,
  'Sent when a recurring membership charge fails (dunning)'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'membership_payment_failed');

UPDATE public.notification_templates
SET title = 'Membership payment failed',
    body  = 'We could not charge your card for your {{membership_name}} membership at {{provider_name}}. Please update your payment method to keep your benefits.',
    updated_at = NOW()
WHERE key = 'membership_payment_failed';

-- membership_expired
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'membership_expired',
  'Your membership expired',
  'Your {{membership_name}} membership at {{provider_name}} has expired. Rejoin to continue enjoying your benefits.',
  ARRAY['push']::TEXT[],
  ARRAY['membership_name', 'provider_name']::TEXT[],
  '/account-settings/membership',
  true,
  'Sent when a past_due membership expires after the grace period'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'membership_expired');

UPDATE public.notification_templates
SET title = 'Your membership expired',
    body  = 'Your {{membership_name}} membership at {{provider_name}} has expired. Rejoin to continue enjoying your benefits.',
    updated_at = NOW()
WHERE key = 'membership_expired';

-- membership_card_expired (dunning: card expiry specifically)
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'membership_card_expired',
  'Update your payment card',
  'Your saved card has expired and we cannot renew your {{membership_name}} membership at {{provider_name}}. Please update your payment method.',
  ARRAY['push']::TEXT[],
  ARRAY['membership_name', 'provider_name']::TEXT[],
  '/account-settings/membership',
  true,
  'Sent when the saved card on a membership has expired'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'membership_card_expired');

UPDATE public.notification_templates
SET title = 'Update your payment card',
    body  = 'Your saved card has expired and we cannot renew your {{membership_name}} membership at {{provider_name}}. Please update your payment method.',
    updated_at = NOW()
WHERE key = 'membership_card_expired';

-- membership_renewal_success
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT
  'membership_renewal_success',
  'Membership renewed',
  'Your {{membership_name}} membership at {{provider_name}} has been renewed. Next billing date: {{next_billing_date}}.',
  ARRAY['push']::TEXT[],
  ARRAY['membership_name', 'provider_name', 'next_billing_date']::TEXT[],
  '/account-settings/membership',
  true,
  'Sent when a membership auto-renews successfully'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'membership_renewal_success');

UPDATE public.notification_templates
SET title = 'Membership renewed',
    body  = 'Your {{membership_name}} membership at {{provider_name}} has been renewed. Next billing date: {{next_billing_date}}.',
    updated_at = NOW()
WHERE key = 'membership_renewal_success';
