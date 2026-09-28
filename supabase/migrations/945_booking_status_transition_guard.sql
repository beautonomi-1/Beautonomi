-- Phase 1c: shadow-mode booking status transition guard (log violations, never block).

CREATE TABLE IF NOT EXISTS public.booking_status_transition_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status public.booking_status NOT NULL,
  to_status public.booking_status NOT NULL,
  location_type public.location_type,
  db_role TEXT,
  session_user_name TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_status_transition_violations_booking_id
  ON public.booking_status_transition_violations(booking_id, created_at DESC);

COMMENT ON TABLE public.booking_status_transition_violations IS
  'Shadow log of booking status changes that violate the provider/admin transition map (945).';

ALTER TABLE public.booking_status_transition_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_status_transition_violations_superadmin_read
  ON public.booking_status_transition_violations;
CREATE POLICY booking_status_transition_violations_superadmin_read
  ON public.booking_status_transition_violations
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS booking_status_transition_violations_service_role
  ON public.booking_status_transition_violations;
CREATE POLICY booking_status_transition_violations_service_role
  ON public.booking_status_transition_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.booking_status_transition_violations FROM anon;

CREATE OR REPLACE FUNCTION public.booking_status_transition_allowed(
  p_from TEXT,
  p_to TEXT,
  p_location_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_from IS NOT DISTINCT FROM p_to THEN
    RETURN TRUE;
  END IF;

  -- Payment lifecycle / webhook paths
  IF p_from = 'pending_payment' AND p_to IN ('pending', 'confirmed', 'cancelled') THEN
    RETURN TRUE;
  END IF;

  -- Dispute-driven full refund after completion
  IF p_from = 'completed' AND p_to = 'cancelled' THEN
    RETURN TRUE;
  END IF;

  -- At-home recovery from salon-only stuck states
  IF COALESCE(p_location_type, '') = 'at_home'
     AND p_from IN ('checked_in', 'waiting')
     AND p_to = 'confirmed' THEN
    RETURN TRUE;
  END IF;

  -- Block at-home targets into salon-only statuses (mirrors TS)
  IF COALESCE(p_location_type, '') = 'at_home' AND p_to IN ('checked_in', 'waiting') THEN
    RETURN FALSE;
  END IF;

  CASE p_from
    WHEN 'pending' THEN RETURN p_to IN ('confirmed', 'checked_in', 'cancelled');
    WHEN 'pending_payment' THEN RETURN p_to = 'cancelled';
    WHEN 'confirmed' THEN RETURN p_to IN ('checked_in', 'in_progress', 'cancelled', 'no_show');
    WHEN 'in_progress' THEN RETURN p_to IN ('completed', 'cancelled');
    WHEN 'completed' THEN RETURN FALSE;
    WHEN 'cancelled' THEN RETURN FALSE;
    WHEN 'no_show' THEN RETURN FALSE;
    WHEN 'waiting' THEN RETURN p_to IN ('checked_in', 'in_progress', 'cancelled');
    WHEN 'checked_in' THEN RETURN p_to IN ('in_progress', 'cancelled');
    ELSE RETURN FALSE;
  END CASE;
END;
$$;

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

  -- service_role / backend writers, and direct maintenance sessions (SQL editor, migrations).
  -- current_user is the function owner under SECURITY DEFINER, so session_user is checked.
  IF COALESCE(auth.role(), '') = 'service_role'
     OR COALESCE(current_setting('role', true), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  v_location := COALESCE(NEW.location_type::TEXT, '');

  -- Admin: any non-terminal -> any valid enum value; terminal -> only no-op or completed->cancelled (handled above)
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
      jsonb_build_object('trigger_mode', 'shadow')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_status_transition ON public.bookings;
CREATE TRIGGER trg_guard_booking_status_transition
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_booking_status_transition();
