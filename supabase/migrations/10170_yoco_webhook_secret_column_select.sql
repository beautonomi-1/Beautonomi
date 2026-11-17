-- Any active staff member of a salon can read provider_yoco_webhooks,
-- including the webhook secret. Drop the table read for anon and
-- authenticated, then grant every other column. The webhook id and
-- callback address stay. INSERT and UPDATE stay, so a connection can
-- still store that secret. Signature checks keep the original table read.

REVOKE SELECT ON TABLE public.provider_yoco_webhooks FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  webhook_id,
  created_at,
  updated_at,
  environment,
  callback_url
) ON TABLE public.provider_yoco_webhooks TO anon, authenticated;
