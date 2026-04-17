-- 503_reschedule_slot_conflict.sql
-- Remediates part of Blocker B5 from the 2026-04 production audit:
-- /api/me/bookings/[id]/reschedule and /api/me/group-bookings/[id]/reschedule
-- validated slot availability in the application layer and then wrote the
-- new `scheduled_at` with only an optimistic version check on the same
-- booking row. A second reschedule (different booking, same staff, same
-- timestamp) landing between the JS availability call and the UPDATE would
-- create a double-booking.
--
-- This RPC performs a SERIALIZABLE-safe check against booking_services
-- while holding a transaction-scoped advisory lock keyed by staff_id and
-- 15-minute bucket, so two parallel reschedules targeting the same
-- (staff_id, start_bucket) cannot both report "no conflict".

BEGIN;

CREATE OR REPLACE FUNCTION public.check_reschedule_slot_conflict(
  p_booking_id    uuid,
  p_staff_id      uuid,
  p_provider_id   uuid,
  p_new_start     timestamptz,
  p_total_minutes integer
)
RETURNS TABLE (conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket       bigint;
  v_lock_key1    bigint;
  v_lock_key2    bigint;
  v_end          timestamptz := p_new_start + make_interval(mins => GREATEST(p_total_minutes, 0));
  v_conflict     boolean := false;
BEGIN
  -- 15-minute bucket so two reschedules aimed at the exact same clock face
  -- collide on the same advisory lock.
  v_bucket := floor(extract(epoch FROM p_new_start) / 900)::bigint;
  v_lock_key1 := ('x' || substr(md5(p_staff_id::text), 1, 16))::bit(64)::bigint;
  v_lock_key2 := v_bucket;

  PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

  -- Overlap on same staff, excluding this booking.
  SELECT EXISTS (
    SELECT 1
      FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
     WHERE bs.staff_id = p_staff_id
       AND b.id <> p_booking_id
       AND b.status NOT IN ('cancelled', 'no_show', 'completed')
       AND bs.scheduled_start_at < v_end
       AND bs.scheduled_end_at   > p_new_start
  ) INTO v_conflict;

  -- Also consider approved staff time-off (day-level) overlapping the slot.
  IF NOT v_conflict THEN
    IF EXISTS (
      SELECT 1
        FROM public.staff_time_off sto
       WHERE sto.staff_id = p_staff_id
         AND sto.status = 'approved'
         AND sto.start_date <= v_end::date
         AND sto.end_date   >= p_new_start::date
    ) THEN
      v_conflict := true;
    END IF;
  END IF;

  conflict := v_conflict;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_reschedule_slot_conflict(
  uuid, uuid, uuid, timestamptz, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_reschedule_slot_conflict(
  uuid, uuid, uuid, timestamptz, integer
) TO service_role;

COMMIT;
