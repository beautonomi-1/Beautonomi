-- Any active staff member of a salon can read provider_twilio_integrations,
-- including the SMS and WhatsApp sender numbers. Drop the table read for
-- anon and authenticated, then grant every other column. INSERT and UPDATE
-- stay, so a connection can still store those numbers. The messaging
-- settings screen keeps the original table read after the marketing or
-- settings permission check.

REVOKE SELECT ON TABLE public.provider_twilio_integrations FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  account_sid,
  auth_token,
  is_sms_enabled,
  is_whatsapp_enabled,
  sms_test_status,
  whatsapp_test_status,
  sms_test_error,
  whatsapp_test_error,
  last_tested_at,
  connected_date,
  metadata,
  created_at,
  updated_at
) ON TABLE public.provider_twilio_integrations TO anon, authenticated;
