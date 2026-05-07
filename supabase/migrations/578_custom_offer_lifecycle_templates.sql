-- Custom offer lifecycle: in-app notification types + templates (withdrawn, expired, declined).

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_custom_offer_declined';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'customer_custom_offer_withdrawn';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'customer_custom_offer_expired';

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
  'provider_custom_offer_declined',
  'Custom offer declined',
  '{{customer_name}} declined your custom offer.',
  ARRAY['push', 'email']::TEXT[],
  'Offer declined',
  '<p>{{customer_name}} declined your custom service offer.</p><p>You can follow up in messaging or send a revised offer.</p>',
  ARRAY['customer_name', 'offer_id', 'request_id']::TEXT[],
  '/provider/messaging?offer_id={{offer_id}}',
  true,
  'Sent to the provider when the customer declines a pending custom offer'
),
(
  NULL,
  'customer_custom_offer_withdrawn',
  'Offer withdrawn',
  '{{provider_name}} withdrew their custom offer. You can still get new offers on your request.',
  ARRAY['push', 'email']::TEXT[],
  'Offer withdrawn',
  '<p><strong>{{provider_name}}</strong> withdrew their custom offer.</p><p>You can still receive new offers for your request.</p>',
  ARRAY['provider_name', 'offer_id', 'request_id']::TEXT[],
  '/account-settings/custom-requests?request={{request_id}}&offer={{offer_id}}',
  true,
  'Sent when the provider retracts a pending or payment_pending custom offer'
),
(
  NULL,
  'customer_custom_offer_expired',
  'Offer expired',
  'Your custom offer from {{provider_name}} has expired. Ask for a new quote if you still need the service.',
  ARRAY['push', 'email']::TEXT[],
  'Custom offer expired',
  '<p>The custom offer from <strong>{{provider_name}}</strong> has expired.</p><p>If you still need the service, message them or submit a new request.</p>',
  ARRAY['provider_name', 'offer_id', 'request_id']::TEXT[],
  '/account-settings/custom-requests?request={{request_id}}&offer={{offer_id}}',
  true,
  'Sent when an offer passes expiration (e.g. customer attempted to accept after expiry)'
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
