-- Return refunds now credit the customer's wallet instantly (store credit path).
-- The old copy promised a 5–10 business day card reversal that never happened.

UPDATE public.notification_templates
SET
  body = 'Your refund of {{refund_amount}} for order {{order_number}} has been added to your wallet.',
  email_body = '<h2>Refund Processed</h2><p>Your refund of <strong>{{refund_amount}}</strong> for order <strong>{{order_number}}</strong> has been added to your Beautonomi wallet.</p><p>Open the app to view your wallet balance.</p>',
  updated_at = NOW()
WHERE key = 'product_return_refunded' AND tenant_id IS NULL;
