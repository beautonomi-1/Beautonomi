-- Any active staff member of a salon can still read the email provider API
-- key and secret. The sending address is already withheld. Drop the table
-- read for anon and authenticated again, then grant every remaining column
-- except those secrets and the sending address. The sender name stays.
-- INSERT and UPDATE stay, so a connection can still store the credentials.
-- Message sending keeps the original table read.

REVOKE SELECT ON TABLE public.provider_email_integrations FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  provider_name,
  from_name,
  is_enabled,
  test_status,
  test_error,
  last_tested_at,
  connected_date,
  metadata,
  created_at,
  updated_at
) ON TABLE public.provider_email_integrations TO anon, authenticated;
