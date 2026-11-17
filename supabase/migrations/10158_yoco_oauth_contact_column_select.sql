-- Any active staff member of a salon can read provider_yoco_oauth_tokens,
-- including the connected account email. Drop the table read for anon and
-- authenticated, then grant every other column. INSERT and UPDATE stay, so
-- a connection can still store that address. The connection status and the
-- payment calls keep the original table read.

REVOKE SELECT ON TABLE public.provider_yoco_oauth_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  tenant_id,
  environment,
  access_token,
  refresh_token,
  token_type,
  scope,
  expires_at,
  refresh_expires_at,
  business_id,
  business_name,
  last_refreshed_at,
  last_refresh_error,
  metadata,
  created_at,
  updated_at
) ON TABLE public.provider_yoco_oauth_tokens TO anon, authenticated;
