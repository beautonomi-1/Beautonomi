-- A table-level SELECT grant lets any signed-in staff session read
-- waitlist_entries.customer_email and customer_phone, including a guest row
-- that has no user account. API responses already drop those fields unless
-- the viewer may see clients. Drop the table read for anon and authenticated,
-- then grant every other column. The service role keeps the table grant so
-- notify and auto-booking can still reach a guest. INSERT and UPDATE stay,
-- so a guest can still be added with an email or phone.

REVOKE SELECT ON TABLE public.waitlist_entries FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  customer_id,
  customer_name,
  service_id,
  staff_id,
  preferred_date,
  preferred_time_start,
  preferred_time_end,
  notes,
  status,
  priority,
  created_at,
  updated_at,
  location_id
) ON TABLE public.waitlist_entries TO anon, authenticated;
