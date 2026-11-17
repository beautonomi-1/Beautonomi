-- A table-level SELECT grant lets any signed-in session read
-- booking_participants.participant_email and participant_phone, including a
-- guest who has no user account. API responses already drop those fields
-- unless the viewer may see clients. Drop the table read for anon and
-- authenticated, then grant every other column. The service role keeps the
-- table grant so invites and cancellation notices can still reach a guest.
-- INSERT and UPDATE stay, so a guest can still be stored with an email or phone.

REVOKE SELECT ON TABLE public.booking_participants FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  booking_id,
  group_booking_id,
  participant_name,
  is_primary_contact,
  created_at,
  updated_at,
  service_id,
  service_name,
  price,
  duration_minutes,
  addons,
  checked_in_at,
  checked_out_at,
  customer_id,
  notes,
  amount_due,
  amount_paid,
  participant_payment_status
) ON TABLE public.booking_participants TO anon, authenticated;
