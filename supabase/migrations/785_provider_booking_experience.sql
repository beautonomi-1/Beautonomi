-- Provider booking experience: refund confirmation, provider payment template

ALTER TABLE booking_refunds
  ADD COLUMN IF NOT EXISTS customer_confirmation_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_deadline_at TIMESTAMPTZ;

COMMENT ON COLUMN booking_refunds.customer_confirmation_required IS
  'When true (cash/in-person refunds), refund stays pending until customer confirms or deadline passes.';

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
    'provider_payment_received',
    'Payment received',
    'Payment received: {{amount}} for booking #{{booking_number}} from {{customer_name}}.',
    ARRAY['push']::TEXT[],
    'Payment received for booking #{{booking_number}}',
    '<p>Payment received: <strong>{{amount}}</strong> for booking <strong>#{{booking_number}}</strong> from {{customer_name}}.</p>',
    ARRAY['amount', 'booking_number', 'booking_id', 'customer_name', 'payment_method']::TEXT[],
    '/provider/bookings/{{booking_id}}',
    true,
    'Provider: customer paid for booking'
  ),
  (
    NULL,
    'cash_refund_confirmation',
    'Confirm your refund',
    '{{provider_name}} recorded a {{amount}} cash refund for booking #{{booking_number}}. Tap to confirm or dispute.',
    ARRAY['push', 'email', 'sms']::TEXT[],
    'Confirm your refund from {{provider_name}}',
    '<p>{{provider_name}} recorded a cash refund of <strong>{{amount}}</strong> for booking #{{booking_number}}.</p><p><a href="{{confirm_url}}">Confirm refund</a> or <a href="{{dispute_url}}">dispute</a>.</p>',
    ARRAY['amount', 'booking_number', 'booking_id', 'refund_id', 'provider_name', 'confirm_url', 'dispute_url']::TEXT[],
    '/account-settings/bookings/{{booking_id}}',
    true,
    'Customer confirms provider-recorded cash refund'
  ),
  (
    NULL,
    'walk_in_app_nudge',
    'Manage your bookings on Beautonomi',
    'Thanks for visiting {{provider_name}}! Create your free account to view booking #{{booking_number}} and rebook easily: {{claim_link}}',
    ARRAY['email', 'sms']::TEXT[],
    'Your visit at {{provider_name}} — join Beautonomi',
    '<p>Thanks for visiting <strong>{{provider_name}}</strong>.</p><p>Create your free Beautonomi account to manage booking #{{booking_number}}, earn rewards, and rebook easily.</p><p><a href="{{claim_link}}">Claim your account</a></p>',
    ARRAY['provider_name', 'booking_number', 'claim_link', 'app_store_link', 'play_store_link', 'booking_id']::TEXT[],
    NULL,
    true,
    'Walk-in customer app download nudge'
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
