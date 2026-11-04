-- Customer notification when an online product-order Paystack charge fails.

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
    'product_order_payment_failed',
    'Order payment failed',
    'Your payment for order {{order_number}} did not go through. Open the app to try again.',
    ARRAY['push', 'email']::TEXT[],
    'Order payment failed — {{order_number}}',
    '<h2>Payment failed</h2><p>We could not charge your card for order <strong>{{order_number}}</strong>. Any wallet amount used has been returned.</p><p><a href="/product-orders">View orders</a></p>',
    ARRAY['order_number', 'order_id', 'amount', 'failure_reason']::TEXT[],
    '/product-orders',
    true,
    'Sent when Paystack charge.failed for a pending product order checkout'
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
