-- ============================================================================
-- Migration 284: Order confirmation notification template (OneSignal)
-- Used when a customer places a product order; sent via notification-service.
-- Variables: order_number, order_id, total_amount
-- ============================================================================

INSERT INTO notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
VALUES (
  'order_confirmation',
  'Order confirmed – {{order_number}}',
  'Thanks for your order! Your order {{order_number}} for {{total_amount}} has been confirmed.',
  ARRAY['push', 'email']::TEXT[],
  'Order confirmed – {{order_number}}',
  '<h2>Order confirmed</h2><p>Thanks for your order!</p><p>Order <strong>{{order_number}}</strong></p><p>Total: <strong>{{total_amount}}</strong></p><p><a href="/account-settings/orders">View your orders</a></p>',
  ARRAY['order_number', 'order_id', 'total_amount']::TEXT[],
  '/account-settings/orders',
  'Sent to customer when they place a product order (OneSignal push + email)'
)
ON CONFLICT (key) DO NOTHING;
