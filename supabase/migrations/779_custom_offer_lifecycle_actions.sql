-- Custom offer lifecycle: provider decline request, customer request changes, offer edit in place, expiry notifications.

-- 1) custom_requests: provider can decline inbound requests
ALTER TABLE custom_requests
  DROP CONSTRAINT IF EXISTS custom_requests_status_check;

ALTER TABLE custom_requests
  ADD CONSTRAINT custom_requests_status_check
  CHECK (status IN (
    'pending',
    'offered',
    'expired',
    'fulfilled',
    'cancelled',
    'declined'
  ));

ALTER TABLE custom_requests
  ADD COLUMN IF NOT EXISTS declined_reason TEXT,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

COMMENT ON COLUMN custom_requests.status IS
  'pending, offered, expired, fulfilled, cancelled, declined (provider declined without sending an offer)';

-- 2) custom_offers: customer can request changes on a pending offer
ALTER TABLE custom_offers
  DROP CONSTRAINT IF EXISTS custom_offers_status_check;

ALTER TABLE custom_offers
  ADD CONSTRAINT custom_offers_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'declined',
    'expired',
    'payment_pending',
    'paid',
    'withdrawn',
    'finalize_failed',
    'changes_requested'
  ));

ALTER TABLE custom_offers
  ADD COLUMN IF NOT EXISTS change_request_note TEXT,
  ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN custom_offers.status IS
  'pending, accepted, declined, expired, payment_pending, paid, withdrawn, finalize_failed, changes_requested (customer asked for revisions)';

-- 3) Notification enum values
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'customer_custom_request_declined';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_custom_offer_changes_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'customer_custom_offer_updated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'customer_custom_request_expired';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_custom_request_expired';

-- 4) Notification templates
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
VALUES
(
  NULL,
  'customer_custom_request_declined',
  'Request declined',
  '{{provider_name}} is unable to fulfil your custom request.',
  ARRAY['push', 'email']::TEXT[],
  'Custom request declined',
  '<p><strong>{{provider_name}}</strong> is unable to fulfil your custom request.</p>{{#if reason}}<p>Reason: {{reason}}</p>{{/if}}<p>You can try another provider or submit a new request.</p>',
  ARRAY['provider_name', 'request_id', 'reason']::TEXT[],
  '/account-settings/custom-requests?request={{request_id}}',
  true,
  'Sent to the customer when the provider declines a custom request without sending an offer'
),
(
  NULL,
  'provider_custom_offer_changes_requested',
  'Changes requested',
  '{{customer_name}} requested changes to your custom offer.',
  ARRAY['push', 'email']::TEXT[],
  'Customer requested offer changes',
  '<p><strong>{{customer_name}}</strong> requested changes to your custom offer.</p><p>{{change_note}}</p><p>Review the note and update your offer.</p>',
  ARRAY['customer_name', 'offer_id', 'request_id', 'change_note']::TEXT[],
  '/provider/custom-requests/{{request_id}}',
  true,
  'Sent to the provider when the customer requests changes on a pending custom offer'
),
(
  NULL,
  'customer_custom_offer_updated',
  'Offer updated',
  '{{provider_name}} updated your custom offer.',
  ARRAY['push', 'email']::TEXT[],
  'Custom offer updated',
  '<p><strong>{{provider_name}}</strong> updated your custom offer.</p><p>Review the revised quote and accept or decline when ready.</p>',
  ARRAY['provider_name', 'offer_id', 'request_id']::TEXT[],
  '/account-settings/custom-requests?request={{request_id}}&offer={{offer_id}}',
  true,
  'Sent when the provider edits a pending or changes_requested offer in place'
),
(
  NULL,
  'customer_custom_request_expired',
  'Request expired',
  'Your custom request to {{provider_name}} has expired.',
  ARRAY['push', 'email']::TEXT[],
  'Custom request expired',
  '<p>Your custom request to <strong>{{provider_name}}</strong> has expired.</p><p>Submit a new request if you still need the service.</p>',
  ARRAY['provider_name', 'request_id']::TEXT[],
  '/account-settings/custom-requests?request={{request_id}}',
  true,
  'Sent when a custom request expires via cron or lazy expiry'
),
(
  NULL,
  'provider_custom_request_expired',
  'Request expired',
  'A custom request from {{customer_name}} has expired.',
  ARRAY['push', 'email']::TEXT[],
  'Custom request expired',
  '<p>A custom request from <strong>{{customer_name}}</strong> has expired.</p>',
  ARRAY['customer_name', 'request_id']::TEXT[],
  '/provider/custom-requests/{{request_id}}',
  true,
  'Sent when a custom request expires via cron or lazy expiry'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();
