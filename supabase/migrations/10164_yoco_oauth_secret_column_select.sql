-- Any active staff member of a salon can still read the Yoco access token
-- and refresh token. The account email is already withheld. Drop the table
-- read for anon and authenticated again, then grant every remaining column
-- except those tokens and the account email. INSERT and UPDATE stay, so a
-- connection can still store the tokens. Payment calls keep the original
-- table read.

REVOKE SELECT ON TABLE public.provider_yoco_oauth_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  tenant_id,
  environment,
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
