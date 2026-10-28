-- 1014: Status-change audit must never write a fake users.id.
--
-- Production still had the migration 101 body of log_booking_status_change
-- (verified 2026-10-23): COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000').
-- Service-role booking updates have no auth.uid(), so the trigger inserted the
-- sentinel UUID, hit booking_audit_log_created_by_fkey, and rolled back the
-- booking UPDATE (provider cancel 500, code 23503).
-- Migration 404 is recorded as applied but its function body is not live.
--
-- This replacement:
--   1. Picks created_by only from public.users (auth.uid, cancelled_by, customer_id).
--   2. Never uses the all-zero sentinel.
--   3. Skips the audit insert when no real user exists, so the status change commits.

CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_created_by_name text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT u.id, u.full_name
    INTO v_created_by, v_created_by_name
  FROM public.users u
  WHERE u.id IN (auth.uid(), NEW.cancelled_by, NEW.customer_id)
  ORDER BY
    CASE u.id
      WHEN auth.uid() THEN 0
      WHEN NEW.cancelled_by THEN 1
      ELSE 2
    END
  LIMIT 1;

  IF v_created_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.booking_audit_log (
    booking_id,
    event_type,
    event_data,
    created_by,
    created_by_name
  ) VALUES (
    NEW.id,
    CASE
      WHEN NEW.status = 'confirmed' THEN 'confirmed'
      WHEN NEW.status = 'in_progress' THEN 'service_started'
      WHEN NEW.status = 'completed' THEN 'service_completed'
      WHEN NEW.status = 'cancelled' THEN 'cancelled'
      ELSE 'status_changed'
    END,
    jsonb_build_object(
      'previous_status', OLD.status,
      'new_status', NEW.status,
      'field', 'status',
      'old_value', OLD.status,
      'new_value', NEW.status
    ),
    v_created_by,
    COALESCE(NULLIF(btrim(v_created_by_name), ''), 'System')
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_booking_status_change() IS
  'Writes booking_audit_log on status change using a real users.id only. Never uses the all-zero sentinel. Skips the insert if no actor exists so the booking UPDATE still commits.';

DROP TRIGGER IF EXISTS booking_status_change_audit ON public.bookings;
CREATE TRIGGER booking_status_change_audit
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_booking_status_change();
