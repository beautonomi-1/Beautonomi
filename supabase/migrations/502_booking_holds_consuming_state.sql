-- 502_booking_holds_consuming_state.sql
-- Remediates Blocker B4 from the 2026-04 production audit: hold consumption
-- was not atomic. Two parallel `/api/public/booking-holds/[id]/consume`
-- requests could both pass the `hold_status = 'active'` guard before either
-- updated the hold row, producing double-bookings or confused error paths.
--
-- Introduces a transitional `consuming` state plus a single-shot claim RPC
-- that flips `active → consuming` atomically and returns the hold when (and
-- only when) the caller actually wins the race.

BEGIN;

-- Relax the CHECK constraint to allow the transitional `consuming` state.
ALTER TABLE public.booking_holds
  DROP CONSTRAINT IF EXISTS booking_holds_hold_status_check;

ALTER TABLE public.booking_holds
  ADD CONSTRAINT booking_holds_hold_status_check
  CHECK (hold_status IN ('active', 'consuming', 'consumed', 'expired', 'cancelled'));

-- Track when the claim was taken so a stuck `consuming` lease can be reset
-- by the expiry cron.
ALTER TABLE public.booking_holds
  ADD COLUMN IF NOT EXISTS consuming_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_booking_holds_consuming_at
  ON public.booking_holds (consuming_at)
  WHERE hold_status = 'consuming';

-- Atomic claim: returns the row only when this caller wins.
CREATE OR REPLACE FUNCTION public.claim_booking_hold_for_consume(
  p_hold_id uuid
)
RETURNS public.booking_holds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hold public.booking_holds%ROWTYPE;
BEGIN
  UPDATE public.booking_holds
     SET hold_status   = 'consuming',
         consuming_at  = now()
   WHERE id = p_hold_id
     AND hold_status = 'active'
     AND expires_at > now()
  RETURNING * INTO v_hold;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_hold;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_booking_hold_for_consume(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_booking_hold_for_consume(uuid) TO service_role;

-- Release: flip a `consuming` hold back to `active` when the outer flow
-- fails so the customer can retry without waiting for the expiry cron.
CREATE OR REPLACE FUNCTION public.release_booking_hold_from_consume(
  p_hold_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.booking_holds
     SET hold_status  = 'active',
         consuming_at = NULL
   WHERE id = p_hold_id
     AND hold_status = 'consuming'
     AND expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.release_booking_hold_from_consume(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_booking_hold_from_consume(uuid) TO service_role;

-- Recycle stale `consuming` rows whose workers died. Also keeps the existing
-- `expired` sweep semantics (any hold past expires_at, regardless of state).
CREATE OR REPLACE FUNCTION public.expire_stale_booking_holds(
  p_consuming_grace_seconds integer DEFAULT 300
)
RETURNS TABLE (
  expired_count   integer,
  reclaimed_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired   integer := 0;
  v_reclaimed integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.booking_holds
       SET hold_status = 'expired'
     WHERE hold_status IN ('active', 'consuming')
       AND expires_at <= now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired FROM expired;

  WITH reclaimed AS (
    UPDATE public.booking_holds
       SET hold_status  = 'active',
           consuming_at = NULL
     WHERE hold_status = 'consuming'
       AND consuming_at IS NOT NULL
       AND consuming_at < now() - make_interval(secs => p_consuming_grace_seconds)
       AND expires_at > now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_reclaimed FROM reclaimed;

  expired_count   := v_expired;
  reclaimed_count := v_reclaimed;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_booking_holds(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_booking_holds(integer) TO service_role;

COMMIT;
