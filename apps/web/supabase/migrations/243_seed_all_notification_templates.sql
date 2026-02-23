-- ============================================================================
-- Migration 243: Seed all notification templates (extras after 062)
-- ============================================================================
-- Run AFTER 062_notification_templates.sql (which creates the table and ~87
-- base templates). This file adds/updates templates from migrations 100, 191,
-- 192, 238, 239 so that one migration run gives you the full set.
--
-- To upload all templates automatically:
--   1. Ensure table exists: run 062_notification_templates.sql first.
--   2. Run this migration (243).
-- ============================================================================

-- From 100: provider booking cancelled/rescheduled (to provider)
INSERT INTO public.notification_templates (
  key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES
  ('provider_booking_cancelled', 'Booking Cancelled by Customer',
   '{{customer_name}} has cancelled their booking on {{booking_date}} at {{booking_time}}. Services: {{services}}',
   ARRAY['push', 'email']::TEXT[], 'Booking Cancelled - {{customer_name}}',
   '<h2>Booking Cancelled</h2><p>A customer has cancelled their booking.</p><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>Date:</strong> {{booking_date}}</p><p><strong>Time:</strong> {{booking_time}}</p><p><strong>Services:</strong> {{services}}</p><p>Booking ID: {{booking_id}}</p>',
   NULL, ARRAY['customer_name', 'booking_date', 'booking_time', 'services', 'booking_id']::TEXT[],
   '/provider/bookings/{{booking_id}}', true, 'Sent to provider when a customer cancels their booking'),
  ('provider_booking_rescheduled', 'Booking Rescheduled by Customer',
   '{{customer_name}} has rescheduled their booking from {{old_date}} at {{old_time}} to {{new_date}} at {{new_time}}',
   ARRAY['push', 'email']::TEXT[], 'Booking Rescheduled - {{customer_name}}',
   '<h2>Booking Rescheduled</h2><p>A customer has rescheduled their booking.</p><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>New Date:</strong> {{new_date}}</p><p><strong>New Time:</strong> {{new_time}}</p><p><strong>Previous:</strong> {{old_date}} at {{old_time}}</p><p>Booking ID: {{booking_id}}</p>',
   NULL, ARRAY['customer_name', 'new_date', 'new_time', 'old_date', 'old_time', 'booking_id']::TEXT[],
   '/provider/bookings/{{booking_id}}', true, 'Sent to provider when a customer reschedules their booking')
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled, description = EXCLUDED.description, updated_at = NOW();

-- From 191: provider status (suspended, reactivated, approved)
INSERT INTO public.notification_templates (
  key, title, body, email_subject, email_body, sms_body, channels, variables, url, enabled, description
) VALUES
  ('provider_suspended', 'Provider Account Suspended',
   'Your provider account "{{business_name}}" has been suspended. {{reason}} Please contact support if you have any questions.',
   'Your Provider Account Has Been Suspended',
   '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;"><h1 style="color: #dc3545;">Account Suspended</h1><p>Your provider account <strong>"{{business_name}}"</strong> has been suspended.</p><p><strong>Reason:</strong> {{reason}}</p><p>Contact our support team if you have questions.</p><p>Best regards,<br>The Beautonomi Team</p></div></body></html>',
   'Your provider account "{{business_name}}" has been suspended. {{reason}} Contact support for assistance.',
   ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name', 'reason']::TEXT[], '/provider/dashboard', true,
   'Notification sent when a provider account is suspended by superadmin'),
  ('provider_reactivated', 'Provider Account Reactivated',
   'Great news! Your provider account "{{business_name}}" has been reactivated and is now active. You can start receiving bookings again.',
   'Your Provider Account Has Been Reactivated',
   '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif;"><div style="padding: 20px;"><h1 style="color: #28a745;">Account Reactivated</h1><p>Your provider account <strong>"{{business_name}}"</strong> has been reactivated.</p><p>You can now receive new bookings. <a href="{{url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard</a></p><p>Best regards,<br>The Beautonomi Team</p></div></body></html>',
   'Great news! Your provider account "{{business_name}}" has been reactivated. You can start receiving bookings again.',
   ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name']::TEXT[], '/provider/dashboard', true,
   'Notification sent when a provider account is reactivated by superadmin'),
  ('provider_approved', 'Provider Account Approved',
   'Congratulations! Your provider account "{{business_name}}" has been approved and is now active. You can start receiving bookings.',
   'Your Provider Account Has Been Approved',
   '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif;"><div style="padding: 20px;"><h1 style="color: #28a745;">Account Approved</h1><p>Your provider account <strong>"{{business_name}}"</strong> has been approved.</p><p><a href="{{url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard</a></p><p>Best regards,<br>The Beautonomi Team</p></div></body></html>',
   'Congratulations! Your provider account "{{business_name}}" has been approved and is now active.',
   ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name']::TEXT[], '/provider/dashboard', true,
   'Notification sent when a provider account is approved by superadmin')
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body, channels = EXCLUDED.channels, variables = EXCLUDED.variables, url = EXCLUDED.url, description = EXCLUDED.description, updated_at = NOW();

-- From 192: subscription lifecycle
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
VALUES
  ('subscription_upgraded', 'Your Subscription Has Been Upgraded', 'Your subscription has been upgraded to {{plan_name}}. Your new billing amount is {{new_amount}}/{{billing_period}}. Thank you for upgrading!', 'Subscription Upgraded - {{plan_name}}', '<!DOCTYPE html><html><body style="font-family: Arial;"><div style="max-width: 600px; margin: 20px auto; padding: 20px;"><h2>Beautonomi</h2><p>Dear {{business_name}},</p><p>Your subscription has been upgraded.</p><p><strong>New Plan:</strong> {{plan_name}}</p><p><strong>Billing Amount:</strong> {{new_amount}}/{{billing_period}}</p><p>Next billing: {{next_payment_date}}</p><p>Sincerely,<br>The Beautonomi Team</p></div></body></html>', 'Your Beautonomi subscription has been upgraded to {{plan_name}}. New amount: {{new_amount}}/{{billing_period}}.', ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name', 'plan_name', 'old_plan_name', 'new_amount', 'billing_period', 'next_payment_date', 'app_url', 'year']::TEXT[], true, 'Notification sent to a provider when their subscription is upgraded to a higher plan.'),
  ('subscription_downgraded', 'Your Subscription Has Been Downgraded', 'Your subscription has been changed to {{plan_name}}. Your new billing amount is {{new_amount}}/{{billing_period}}. The changes will take effect on {{effective_date}}.', 'Subscription Changed - {{plan_name}}', '<!DOCTYPE html><html><body style="font-family: Arial;"><div style="max-width: 600px; margin: 20px auto; padding: 20px;"><h2>Beautonomi</h2><p>Dear {{business_name}},</p><p>Your subscription plan has been changed.</p><p><strong>New Plan:</strong> {{plan_name}}</p><p><strong>Effective Date:</strong> {{effective_date}}</p><p>Sincerely,<br>The Beautonomi Team</p></div></body></html>', 'Your Beautonomi subscription has been changed to {{plan_name}}. New amount: {{new_amount}}/{{billing_period}}. Effective: {{effective_date}}.', ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name', 'plan_name', 'old_plan_name', 'new_amount', 'billing_period', 'effective_date', 'app_url', 'year']::TEXT[], true, 'Notification sent to a provider when their subscription is downgraded or changed to a lower plan.'),
  ('subscription_cancelled', 'Your Subscription Has Been Cancelled', 'Your subscription has been cancelled. Your access will continue until {{expires_at}}. You can reactivate your subscription anytime before then.', 'Subscription Cancelled - Access Until {{expires_at}}', '<!DOCTYPE html><html><body style="font-family: Arial;"><div style="max-width: 600px; margin: 20px auto; padding: 20px;"><h2>Beautonomi</h2><p>Dear {{business_name}},</p><p>Your subscription has been cancelled. Access continues until {{expires_at}}.</p><p>Sincerely,<br>The Beautonomi Team</p></div></body></html>', 'Your Beautonomi subscription has been cancelled. Access continues until {{expires_at}}. You can reactivate anytime.', ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name', 'plan_name', 'expires_at', 'app_url', 'year']::TEXT[], true, 'Notification sent to a provider when their subscription is cancelled.'),
  ('subscription_renewed', 'Your Subscription Has Been Renewed', 'Your subscription has been automatically renewed. Your next billing date is {{next_payment_date}}.', 'Subscription Renewed - Next Payment: {{next_payment_date}}', '<!DOCTYPE html><html><body style="font-family: Arial;"><div style="max-width: 600px; margin: 20px auto; padding: 20px;"><h2>Beautonomi</h2><p>Dear {{business_name}},</p><p>Your subscription has been renewed. Next payment: {{next_payment_date}}.</p><p>Sincerely,<br>The Beautonomi Team</p></div></body></html>', 'Your Beautonomi subscription has been renewed. Next payment: {{next_payment_date}}.', ARRAY['push', 'email', 'sms']::TEXT[], ARRAY['business_name', 'plan_name', 'amount', 'billing_period', 'next_payment_date', 'app_url', 'year']::TEXT[], true, 'Notification sent to a provider when their subscription is automatically renewed.')
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body, channels = EXCLUDED.channels, variables = EXCLUDED.variables, enabled = EXCLUDED.enabled, description = EXCLUDED.description, updated_at = NOW();

-- From 238: product order lifecycle
INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
VALUES
  ('product_order_placed', 'New Product Order', 'You have a new product order {{order_number}} from {{customer_name}} for R{{total_amount}}', ARRAY['push', 'email']::TEXT[], 'New Product Order - {{order_number}}',
   '<h2>New Product Order</h2><p>Customer <strong>{{customer_name}}</strong> placed order <strong>{{order_number}}</strong> for <strong>R{{total_amount}}</strong>.</p><p>Items: {{item_count}}</p><p>Fulfillment: {{fulfillment_type}}</p><p><a href="{{dashboard_url}}">View Order</a></p>',
   ARRAY['order_number', 'customer_name', 'total_amount', 'item_count', 'fulfillment_type', 'dashboard_url']::TEXT[], '/provider/product-orders', 'Sent to provider when a customer places a product order'),
  ('product_order_confirmed', 'Order Confirmed', 'Your order {{order_number}} has been confirmed by {{provider_name}}', ARRAY['push', 'email']::TEXT[], 'Order Confirmed - {{order_number}}',
   '<h2>Order Confirmed</h2><p>{{provider_name}} has confirmed your order <strong>{{order_number}}</strong>.</p><p>{{estimated_info}}</p>', ARRAY['order_number', 'provider_name', 'estimated_info']::TEXT[], '/product-orders', 'Sent to customer when provider confirms their order'),
  ('product_order_ready_collection', 'Order Ready for Collection', 'Your order {{order_number}} is ready for collection at {{location_name}}', ARRAY['push', 'email']::TEXT[], 'Your Order is Ready - {{order_number}}',
   '<h2>Ready for Collection</h2><p>Your order <strong>{{order_number}}</strong> is ready to pick up at <strong>{{location_name}}</strong>.</p><p>{{location_address}}</p>', ARRAY['order_number', 'location_name', 'location_address']::TEXT[], '/product-orders', 'Sent to customer when order is ready for in-store collection'),
  ('product_order_shipped', 'Order Shipped', 'Your order {{order_number}} has been shipped! Tracking: {{tracking_number}}', ARRAY['push', 'email']::TEXT[], 'Your Order Has Shipped - {{order_number}}',
   '<h2>Order Shipped</h2><p>Your order <strong>{{order_number}}</strong> is on its way!</p><p>Tracking: <strong>{{tracking_number}}</strong></p><p>Estimated delivery: {{estimated_delivery}}</p>', ARRAY['order_number', 'tracking_number', 'estimated_delivery']::TEXT[], '/product-orders', 'Sent to customer when order is shipped with tracking info'),
  ('product_order_delivered', 'Order Delivered', 'Your order {{order_number}} has been delivered! Leave a review?', ARRAY['push', 'email']::TEXT[], NULL, NULL, ARRAY['order_number']::TEXT[], '/product-orders', 'Sent to customer when order is marked as delivered, prompts for review'),
  ('product_order_cancelled', 'Order Cancelled', 'Your order {{order_number}} has been cancelled. {{cancellation_reason}}', ARRAY['push', 'email']::TEXT[], 'Order Cancelled - {{order_number}}',
   '<h2>Order Cancelled</h2><p>Your order <strong>{{order_number}}</strong> has been cancelled.</p><p>Reason: {{cancellation_reason}}</p><p>If you were charged, a refund will be processed within 5-10 business days.</p>', ARRAY['order_number', 'cancellation_reason']::TEXT[], '/product-orders', 'Sent to customer when their order is cancelled')
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels, email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, variables = EXCLUDED.variables, url = EXCLUDED.url, description = EXCLUDED.description, updated_at = NOW();

-- From 239: product returns
INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
VALUES
  ('product_return_requested', 'Return Request Received', 'A return request for order {{order_number}} has been submitted by {{customer_name}}', ARRAY['push', 'email']::TEXT[], 'Return Request - {{order_number}}',
   '<h2>Return Request</h2><p>Customer <strong>{{customer_name}}</strong> has requested a return for order <strong>{{order_number}}</strong>.</p><p>Reason: {{reason}}</p><p>Amount: R{{refund_amount}}</p><p><a href="{{dashboard_url}}">Review Request</a></p>',
   ARRAY['order_number', 'customer_name', 'reason', 'refund_amount', 'dashboard_url']::TEXT[], '/provider/ecommerce/returns', 'Sent to provider when customer requests a return'),
  ('product_return_approved', 'Return Approved', 'Your return request for order {{order_number}} has been approved', ARRAY['push', 'email']::TEXT[], 'Return Approved - {{order_number}}',
   '<h2>Return Approved</h2><p>Your return request for order <strong>{{order_number}}</strong> has been approved.</p><p>{{return_instructions}}</p>', ARRAY['order_number', 'return_instructions']::TEXT[], '/product-orders', 'Sent to customer when return is approved'),
  ('product_return_rejected', 'Return Request Update', 'Your return request for order {{order_number}} could not be approved. Reason: {{reason}}', ARRAY['push', 'email']::TEXT[], 'Return Request Update - {{order_number}}',
   '<h2>Return Request Update</h2><p>Unfortunately, your return request for order <strong>{{order_number}}</strong> could not be approved.</p><p>Reason: {{reason}}</p><p>If you believe this is incorrect, you can escalate to our support team.</p>', ARRAY['order_number', 'reason']::TEXT[], '/product-orders', 'Sent to customer when return is rejected'),
  ('product_return_refunded', 'Refund Processed', 'Your refund of R{{refund_amount}} for order {{order_number}} has been processed', ARRAY['push', 'email']::TEXT[], 'Refund Processed - {{order_number}}',
   '<h2>Refund Processed</h2><p>Your refund of <strong>R{{refund_amount}}</strong> for order <strong>{{order_number}}</strong> has been processed.</p><p>Please allow 5-10 business days for the refund to reflect.</p>', ARRAY['order_number', 'refund_amount']::TEXT[], '/product-orders', 'Sent to customer when refund is processed')
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels, email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, variables = EXCLUDED.variables, url = EXCLUDED.url, description = EXCLUDED.description, updated_at = NOW();
