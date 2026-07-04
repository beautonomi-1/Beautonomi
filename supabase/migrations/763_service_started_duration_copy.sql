-- Ensure service_started push copy reads cleanly when duration is omitted at send time.
UPDATE public.notification_templates
SET
  body = 'Your service with {{provider_name}} has started. Estimated duration: {{service_duration}}.',
  updated_at = NOW()
WHERE key = 'service_started';
