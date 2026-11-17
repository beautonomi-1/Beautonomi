-- The expiry push always said to renew and restore features. A plan that
-- ended because the provider cancelled uses a different sentence. The sender
-- passes that sentence as notice.

UPDATE public.notification_templates
SET
  body = '{{notice}}',
  variables = ARRAY['business_name', 'reason', 'app_url', 'notice']
WHERE key = 'subscription_expired';
