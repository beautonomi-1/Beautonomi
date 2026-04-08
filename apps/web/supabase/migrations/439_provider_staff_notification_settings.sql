-- Per–team-member notification preferences (provider team settings UI).
ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.provider_staff.notification_settings IS
  'JSON: email_enabled, sms_enabled, desktop_enabled, appointment_reminders, etc.';
