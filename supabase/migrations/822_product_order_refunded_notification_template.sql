-- Product order store-credit / wallet refund notification template.

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
    'product_order_refunded',
    'Refund Added to Wallet',
    'Your refund of {{refund_amount}} for order {{order_number}} has been added to your wallet.',
    ARRAY['push', 'email']::TEXT[],
    'Refund Added to Wallet - {{order_number}}',
    '<h2>Refund Processed</h2><p>Your refund of <strong>{{refund_amount}}</strong> for order <strong>{{order_number}}</strong> has been added to your wallet.</p><p><a href="/product-orders">View Orders</a></p>',
    ARRAY['order_number', 'order_id', 'refund_amount']::TEXT[],
    '/product-orders',
    true,
    'Sent to customer when a product order is refunded to store credit / wallet'
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
