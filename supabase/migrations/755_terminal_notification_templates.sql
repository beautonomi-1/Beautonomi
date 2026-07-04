-- Migration 755: Terminal notification templates
--
-- Seeds notification_templates for terminal order confirmation, receipt,
-- and campaign announcement (mirrors pattern from 738_subscription_receipt).
--
-- Columns: key, title, body, channels (TEXT[]), variables (TEXT[]), enabled, description

INSERT INTO public.notification_templates (key, title, body, channels, variables, enabled, description)
SELECT key, title, body, channels, variables, true, description
FROM (
  VALUES
    (
      'terminal_order_confirmed',
      'Terminal order confirmed',
      'Hi {{business_name}}, your {{product_name}} order ({{commercial_model}}) has been confirmed. Order reference: {{order_id}}.',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'product_name', 'order_id', 'commercial_model', 'total_amount', 'currency', 'app_url'],
      'Sent to provider when their terminal order is confirmed.'
    ),
    (
      'terminal_order_dispatched',
      'Terminal dispatched',
      'Your {{product_name}} is on the way! Estimated delivery: {{estimated_delivery}}.',
      ARRAY['push', 'email', 'sms'],
      ARRAY['business_name', 'product_name', 'order_id', 'estimated_delivery', 'tracking_url', 'app_url'],
      'Sent to provider when their terminal is dispatched for delivery.'
    ),
    (
      'terminal_order_receipt',
      'Terminal order receipt',
      'Thank you for your terminal order, {{business_name}}. Amount: {{currency}} {{amount}}. Reference: {{reference}}. Download your receipt: {{receipt_url}}',
      ARRAY['email'],
      ARRAY['business_name', 'product_name', 'order_id', 'amount', 'currency', 'payment_date', 'reference', 'receipt_url', 'app_url', 'year'],
      'Receipt email for terminal purchase or first rental payment.'
    ),
    (
      'terminal_upsell_announcement',
      'Terminal upsell announcement',
      '{{headline}} — {{body}}',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'headline', 'body', 'cta_label', 'cta_url', 'app_url'],
      'Promotional announcement for providers without or interested in terminals.'
    )
) AS t(key, title, body, channels, variables, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = t.key
);
