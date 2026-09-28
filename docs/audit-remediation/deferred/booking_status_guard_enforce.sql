-- Phase 1d: enforce booking status transitions (replaces shadow-only guard from 945).

CREATE OR REPLACE FUNCTION public.guard_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_location TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role'
     OR COALESCE(current_setting('role', true), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  v_location := COALESCE(NEW.location_type::TEXT, '');

  IF public.is_superadmin() THEN
    IF OLD.status IN ('completed', 'cancelled', 'no_show') AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_allowed := (OLD.status = 'completed' AND NEW.status = 'cancelled');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    v_allowed := public.booking_status_transition_allowed(
      OLD.status::TEXT,
      NEW.status::TEXT,
      v_location
    );
  END IF;

  IF NOT v_allowed THEN
    INSERT INTO public.booking_status_transition_violations (
      booking_id, from_status, to_status, location_type, db_role, session_user_name, context
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.location_type,
      COALESCE(auth.role(), current_setting('role', true)),
      session_user,
      jsonb_build_object('trigger_mode', 'enforce')
    );
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION'
      USING ERRCODE = 'check_violation',
            DETAIL = format('Cannot change booking % from % to %', NEW.id, OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;
