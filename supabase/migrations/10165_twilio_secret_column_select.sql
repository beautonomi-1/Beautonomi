-- Any active staff member of a salon can still read the Twilio account SID
-- and auth token. The sender numbers are already withheld. Drop the table
-- read for anon and authenticated again, then grant every remaining column
-- except those secrets and the sender numbers. INSERT and UPDATE stay, so a
-- connection can still store the credentials. Message sending keeps the
-- original table read.

REVOKE SELECT ON TABLE public.provider_twilio_integrations FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
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
