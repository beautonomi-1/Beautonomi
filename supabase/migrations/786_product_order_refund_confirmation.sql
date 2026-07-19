-- Product order cash-refund confirmation parity with booking refunds.

ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS refund_customer_confirmation_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_customer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_customer_disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_confirmation_deadline_at TIMESTAMPTZ;

COMMENT ON COLUMN product_orders.refund_customer_confirmation_required IS
  'When true (in-person cash refunds with a customer account), the refund is flagged pending customer confirmation for dispute tracking.';

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
    'product_order_cash_refund_confirmation',
    'Confirm your refund',
    '{{provider_name}} recorded a {{amount}} cash refund for order #{{order_number}}. Tap to confirm or dispute.',
    ARRAY['push', 'email', 'sms']::TEXT[],
    'Confirm your refund from {{provider_name}}',
    '<p>{{provider_name}} recorded a cash refund of <strong>{{amount}}</strong> for order #{{order_number}}.</p><p><a href="{{confirm_url}}">Confirm refund</a> or <a href="{{dispute_url}}">dispute</a>.</p>',
    ARRAY['amount', 'order_number', 'order_id', 'provider_name', 'confirm_url', 'dispute_url']::TEXT[],
    '/account-settings/orders/{{order_id}}',
    true,
    'Customer confirms provider-recorded product order cash refund'
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
