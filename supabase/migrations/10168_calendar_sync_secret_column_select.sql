-- Any active staff member of a salon can read calendar_syncs, including
-- the OAuth access token and refresh token. Drop the table read for anon
-- and authenticated, then grant every other column. The calendar name and
-- iCal address stay. INSERT and UPDATE stay, so a connection can still
-- store those tokens. The OAuth callback keeps the original table read.

REVOKE SELECT ON TABLE public.calendar_syncs FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  provider,
  calendar_id,
  calendar_name,
  ical_url,
  sync_direction,
  is_active,
  last_sync_at,
  sync_error,
  metadata,
  created_at,
  updated_at
) ON TABLE public.calendar_syncs TO anon, authenticated;
