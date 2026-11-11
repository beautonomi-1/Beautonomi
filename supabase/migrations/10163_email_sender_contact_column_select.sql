-- Any active staff member of a salon can read provider_email_integrations,
-- including the sending address. Drop the table read for anon and
-- authenticated, then grant every other column. The sender name stays.
-- INSERT and UPDATE stay, so a connection can still store that address.
-- The messaging settings screen keeps the original table read after the
-- marketing or settings permission check.

REVOKE SELECT ON TABLE public.provider_email_integrations FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  provider_name,
  api_key,
  api_secret,
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
