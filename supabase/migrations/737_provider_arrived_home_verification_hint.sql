-- Update provider_arrived_home template to support an optional verification_hint
-- variable so the push message can say "Open the app for your code" (OTP mode)
-- or "Please let them in." (simple mode) without a separate template.
UPDATE public.notification_templates
SET
  body    = '{{provider_name}} has arrived at your location. {{verification_hint}}',
  sms_body = '{{provider_name}} has arrived at {{service_address}}. {{verification_hint}}',
  variables = ARRAY['provider_name', 'service_address', 'booking_id', 'verification_hint']::TEXT[],
  updated_at = NOW()
WHERE key = 'provider_arrived_home';
