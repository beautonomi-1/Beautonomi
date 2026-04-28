-- Supabase Phone / SMS + Twilio reference: merge new keys when absent (right-hand keys in code ship defaults; DB seed here for existing rows only).
-- Live Auth rules remain in the Supabase project; apps use these via /api/public/config/bundle.
UPDATE public.platform_settings
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{auth}',
    COALESCE(settings->'auth', '{}'::jsonb)
    || jsonb_build_object(
      'phone_provider_enabled', true,
      'phone_confirmations_enabled', true,
      'sms_provider', 'twilio',
      'sms_otp_expiration_seconds', 120,
      'sms_otp_length', 6,
      'sms_message_template', 'Your OTP code is {{ .Code }}'
    ),
    true
  ),
  updated_at = now()
WHERE is_active = true
  AND NOT (COALESCE(settings->'auth', '{}'::jsonb) ? 'phone_provider_enabled');

UPDATE public.platform_settings
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{twilio}',
    COALESCE(settings->'twilio', '{}'::jsonb) || jsonb_build_object('message_service_sid', '', 'content_sid', ''),
    true
  ),
  updated_at = now()
WHERE is_active = true
  AND NOT (COALESCE(settings->'twilio', '{}'::jsonb) ? 'message_service_sid');
