-- Provider-facing notification when a customer cancels a salon membership.
-- Mirrors the pattern in 598_additional_charge_requested_notification_template.sql
-- Idempotent: insert only if missing, then ensure enabled state.

INSERT INTO public.notification_templates (
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  sms_body,
  variables,
  url,
  enabled,
  description
)
SELECT
  'provider_membership_cancelled',
  'Membership cancelled',
  '{{customer_name}} cancelled their {{plan_name}} membership.',
  ARRAY['push', 'email']::TEXT[],
  'Membership cancelled — {{plan_name}}',
  '<h2>Membership cancelled</h2>'
    || '<p>{{customer_name}} cancelled their membership with your business.</p>'
    || '<p><strong>Plan:</strong> {{plan_name}}</p>'
    || '<p>Their benefits will continue until the current expiry date.</p>',
  '{{customer_name}} cancelled their {{plan_name}} membership.',
  ARRAY['customer_name', 'plan_name', 'customer_id', 'subscription_id']::TEXT[],
  '/provider/clients',
  true,
  'Sent to provider team when a customer cancels a salon membership.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = 'provider_membership_cancelled'
);

UPDATE public.notification_templates
SET enabled = true, updated_at = NOW()
WHERE key = 'provider_membership_cancelled' AND enabled IS DISTINCT FROM true;

-- Ensure the notification_type enum carries the new value so the in-app
-- bell row writes preserve the real type instead of falling back to "system".
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_membership_cancelled';
