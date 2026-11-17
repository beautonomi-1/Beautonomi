-- A table-level SELECT grant lets any signed-in session read
-- booking_services.guest_email and guest_phone. The live frame already omits
-- those columns. Drop the table read for anon and authenticated, then grant
-- every other column, including the guest name. The service role keeps the
-- table grant. INSERT and UPDATE stay, so a guest address can still be stored.

REVOKE SELECT ON TABLE public.booking_services FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  booking_id,
  offering_id,
  staff_id,
  guest_name,
  duration_minutes,
  price,
  currency,
  scheduled_start_at,
  scheduled_end_at,
  actual_start_at,
  actual_end_at,
  created_at,
  updated_at,
  customization,
  tax_snapshot,
  group_participant_id
) ON TABLE public.booking_services TO anon, authenticated;
