-- ============================================================================
-- Migration 238: Notification templates for product order lifecycle
-- ============================================================================

INSERT INTO notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
VALUES
  (
    'product_order_placed',
    'New Product Order',
    'You have a new product order {{order_number}} from {{customer_name}} for R{{total_amount}}',
    ARRAY['push', 'email']::TEXT[],
    'New Product Order - {{order_number}}',
    '<h2>New Product Order</h2><p>Customer <strong>{{customer_name}}</strong> placed order <strong>{{order_number}}</strong> for <strong>R{{total_amount}}</strong>.</p><p>Items: {{item_count}}</p><p>Fulfillment: {{fulfillment_type}}</p><p><a href="{{dashboard_url}}">View Order</a></p>',
    ARRAY['order_number', 'customer_name', 'total_amount', 'item_count', 'fulfillment_type', 'dashboard_url']::TEXT[],
    '/provider/product-orders',
    'Sent to provider when a customer places a product order'
  ),
  (
    'product_order_confirmed',
    'Order Confirmed',
    'Your order {{order_number}} has been confirmed by {{provider_name}}',
    ARRAY['push', 'email']::TEXT[],
    'Order Confirmed - {{order_number}}',
    '<h2>Order Confirmed</h2><p>{{provider_name}} has confirmed your order <strong>{{order_number}}</strong>.</p><p>{{estimated_info}}</p>',
    ARRAY['order_number', 'provider_name', 'estimated_info']::TEXT[],
    '/product-orders',
    'Sent to customer when provider confirms their order'
  ),
  (
    'product_order_ready_collection',
    'Order Ready for Collection',
    'Your order {{order_number}} is ready for collection at {{location_name}}',
    ARRAY['push', 'email']::TEXT[],
    'Your Order is Ready - {{order_number}}',
    '<h2>Ready for Collection</h2><p>Your order <strong>{{order_number}}</strong> is ready to pick up at <strong>{{location_name}}</strong>.</p><p>{{location_address}}</p>',
    ARRAY['order_number', 'location_name', 'location_address']::TEXT[],
    '/product-orders',
    'Sent to customer when order is ready for in-store collection'
  ),
  (
    'product_order_shipped',
    'Order Shipped',
    'Your order {{order_number}} has been shipped! Tracking: {{tracking_number}}',
    ARRAY['push', 'email']::TEXT[],
    'Your Order Has Shipped - {{order_number}}',
    '<h2>Order Shipped</h2><p>Your order <strong>{{order_number}}</strong> is on its way!</p><p>Tracking: <strong>{{tracking_number}}</strong></p><p>Estimated delivery: {{estimated_delivery}}</p>',
    ARRAY['order_number', 'tracking_number', 'estimated_delivery']::TEXT[],
    '/product-orders',
    'Sent to customer when order is shipped with tracking info'
  ),
  (
    'product_order_delivered',
    'Order Delivered',
    'Your order {{order_number}} has been delivered! Leave a review?',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['order_number']::TEXT[],
    '/product-orders',
    'Sent to customer when order is marked as delivered, prompts for review'
  ),
  (
    'product_order_cancelled',
    'Order Cancelled',
    'Your order {{order_number}} has been cancelled. {{cancellation_reason}}',
    ARRAY['push', 'email']::TEXT[],
    'Order Cancelled - {{order_number}}',
    '<h2>Order Cancelled</h2><p>Your order <strong>{{order_number}}</strong> has been cancelled.</p><p>Reason: {{cancellation_reason}}</p><p>If you were charged, a refund will be processed within 5-10 business days.</p>',
    ARRAY['order_number', 'cancellation_reason']::TEXT[],
    '/product-orders',
    'Sent to customer when their order is cancelled'
  )
ON CONFLICT (key) DO NOTHING;
