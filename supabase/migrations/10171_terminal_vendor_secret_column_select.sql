-- Anyone can read terminal_vendor_configs, including the OAuth client
-- secret. Drop the table read for anon and authenticated, then grant
-- every other column. The client id and setup text stay. INSERT and
-- UPDATE stay, so a connection can still store that secret. Vendor
-- setup keeps the original table read.

REVOKE SELECT ON TABLE public.terminal_vendor_configs FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  tenant_id,
  vendor,
  display_name,
  description,
  logo_url,
  help_url,
  enabled,
  credential_modes,
  oauth_authorize_url,
  oauth_token_url,
  oauth_revoke_url,
  oauth_client_id,
  oauth_scopes,
  oauth_redirect_path,
  api_base_url,
  api_docs_url,
  webhook_receive_path,
  requires_merchant_id,
  requires_webhook_setup,
  setup_instructions_url,
  setup_instructions_text,
  feature_flag_key,
  metadata,
  created_at,
  updated_at
) ON TABLE public.terminal_vendor_configs TO anon, authenticated;
