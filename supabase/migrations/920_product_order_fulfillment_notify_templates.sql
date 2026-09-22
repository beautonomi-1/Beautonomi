-- 920: Product order fulfillment copy — tracking URL, pickup address/phone, confirmation summary

BEGIN;

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, variables, url, enabled, description
)
VALUES
  (
    NULL,
    'order_confirmation',
    'Order confirmed – {{order_number}}',
    'Thanks for your order! {{order_number}} for {{total_amount}}. {{fulfillment_summary}}',
    ARRAY['push', 'email']::TEXT[],
    'Order confirmed – {{order_number}}',
    '<h2>Order confirmed</h2><p>Thanks for your order!</p><p>Order <strong>{{order_number}}</strong></p><p>Total: <strong>{{total_amount}}</strong></p><p>{{fulfillment_summary}}</p><p><a href="/account-settings/orders">View your orders</a></p>',
    ARRAY['order_number', 'order_id', 'total_amount', 'fulfillment_summary']::TEXT[],
    '/account-settings/orders',
    true,
    'Sent to customer when they place a product order (OneSignal push + email)'
  ),
  (
    NULL,
    'product_order_ready_collection',
    'Order Ready for Collection',
    'Your order {{order_number}} is ready at {{location_name}}. {{location_address}}',
    ARRAY['push', 'email']::TEXT[],
    'Your Order is Ready - {{order_number}}',
    '<h2>Ready for Collection</h2><p>Your order <strong>{{order_number}}</strong> is ready at <strong>{{location_name}}</strong>.</p><p>{{location_address}}</p><p>{{location_phone}}</p>',
    ARRAY['order_number', 'location_name', 'location_address', 'location_phone']::TEXT[],
    '/product-orders',
    true,
    'Sent to customer when order is ready for in-store collection'
  ),
  (
    NULL,
    'product_order_shipped',
    'Order Shipped',
    'Order {{order_number}} shipped. Tracking: {{tracking_number}}',
    ARRAY['push', 'email']::TEXT[],
    'Your Order Has Shipped - {{order_number}}',
    '<h2>Order Shipped</h2><p>Your order <strong>{{order_number}}</strong> is on its way!</p><p>Tracking: <strong>{{tracking_number}}</strong></p><p>Carrier: {{carrier}}</p><p><a href="{{tracking_url}}">Track shipment</a></p><p>Estimated delivery: {{estimated_delivery}}</p>',
    ARRAY['order_number', 'tracking_number', 'tracking_url', 'carrier', 'estimated_delivery', 'estimated_info']::TEXT[],
    '/product-orders',
    true,
    'Sent to customer when order is shipped with tracking info'
  ),
  (
    NULL,
    'product_order_partially_shipped',
    'Part of Your Order Has Shipped',
    '{{shipped_count}} of {{total_count}} items from order {{order_number}} have shipped. {{tracking_info}}',
    ARRAY['push', 'email']::TEXT[],
    'Part of Your Order Has Shipped - {{order_number}}',
    '<h2>Partial Shipment</h2><p><strong>{{shipped_count}}</strong> of <strong>{{total_count}}</strong> items from order <strong>{{order_number}}</strong> are on their way.</p><p>{{shipped_items}}</p><p>{{tracking_info}}</p><p>The remaining items will follow in a separate shipment.</p>',
    ARRAY['order_number', 'order_id', 'shipped_count', 'total_count', 'shipped_items', 'tracking_number', 'tracking_url', 'tracking_info', 'carrier']::TEXT[],
    '/product-orders',
    true,
    'Sent to customer once when some (not all) lines of a product order are marked shipped'
  )
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  description = COALESCE(EXCLUDED.description, notification_templates.description),
  enabled = EXCLUDED.enabled;

COMMIT;
