-- The failed-renewal notice always said features stay active for grace_days.
-- Card retries continue after the 3-day access window, so that sentence was
-- false on the later attempts. access_note is chosen by the sender.

UPDATE public.notification_templates
SET
  body = 'We could not renew your subscription. {{access_note}}',
  variables = ARRAY['business_name', 'grace_days', 'app_url', 'access_note', 'plan_name', 'amount']
WHERE key = 'subscription_payment_failed';
