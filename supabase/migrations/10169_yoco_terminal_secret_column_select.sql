-- Any active staff member of a salon can read provider_yoco_terminals,
-- including the device API key and secret key. Drop the table read for
-- anon and authenticated, then grant every other column. The device name
-- stays. INSERT and UPDATE stay, so a connection can still store those
-- keys. A card charge keeps the original table read.

REVOKE SELECT ON TABLE public.provider_yoco_terminals FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  device_id,
  device_name,
  location_name,
  active,
  created_at,
  updated_at
) ON TABLE public.provider_yoco_terminals TO anon, authenticated;
