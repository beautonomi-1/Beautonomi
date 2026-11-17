-- Any active staff member of a salon can read provider_yoco_integrations,
-- including the checkout secret and the webhook secret. Drop the table
-- read for anon and authenticated, then grant every other column. The
-- public key stays. INSERT and UPDATE stay, so a connection can still
-- store those secrets. Payment calls keep the original table read.

REVOKE SELECT ON TABLE public.provider_yoco_integrations FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  public_key,
  is_enabled,
  connected_date,
  last_sync,
  metadata,
  created_at,
  updated_at,
  credential_mode,
  environment,
  reconnect_banner_dismissed_at
) ON TABLE public.provider_yoco_integrations TO anon, authenticated;
