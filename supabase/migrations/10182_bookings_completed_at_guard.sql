-- Stamp completed_at whenever a booking becomes completed, and fill rows
-- that were completed without a timestamp. Reports and payout holds treat a
-- null completed_at as unfinished.

CREATE OR REPLACE FUNCTION public.stamp_booking_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status::text IN ('cancelled', 'no_show')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_booking_completed_at ON public.bookings;
CREATE TRIGGER trg_stamp_booking_completed_at
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_booking_completed_at();

-- Idempotent fill. Prefer the audit log's service_completed time.
UPDATE public.bookings b
SET completed_at = COALESCE(
  (
    SELECT max(a.created_at)
    FROM public.booking_audit_log a
    WHERE a.booking_id = b.id
      AND a.event_type = 'service_completed'
  ),
  b.updated_at,
  b.created_at
)
WHERE b.status::text = 'completed'
  AND b.completed_at IS NULL;
