-- Admin SPA: document Supabase Auth (email) policy in platform_settings.settings.auth.
-- Merged with app defaults when auth is missing; non-destructive for existing auth keys.
UPDATE public.platform_settings
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{auth}',
    COALESCE(settings->'auth', '{}'::jsonb) || jsonb_build_object(
      'email_provider_enabled', true,
      'secure_email_change', true,
      'secure_password_change', true,
      'require_current_password', true,
      'prevent_leaked_passwords', true,
      'minimum_password_length', 8,
      'password_requirements', 'none',
      'email_otp_expiration_seconds', 3600,
      'email_otp_length', 6
    ),
    true
  ),
  updated_at = now()
WHERE is_active = true
  AND (settings->'auth' IS NULL OR settings->'auth' = 'null'::jsonb);
