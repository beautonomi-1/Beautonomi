-- 501_webhook_events_processing_lease.sql
-- Remediates Blocker B3 from the 2026-04 production audit: if a webhook
-- processor crashes mid-flight the `webhook_events.status` stays on
-- `processing` forever. Any subsequent delivery of the same event short-
-- circuits with `{ processing: true }` and the event is never completed.
--
-- This migration:
--  1. Adds `processing_started_at` to drive a stale-lease heuristic.
--  2. Introduces `public.try_acquire_webhook_event_lease(...)` which atomically
--     (a) inserts a new row, (b) re-acquires a processed-state-permitting row
--     whose lease expired, or (c) refuses when another live worker holds it.
--  3. Back-fills `processing_started_at` for existing rows so older records
--     are never treated as "stuck forever".

BEGIN;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

UPDATE public.webhook_events
   SET processing_started_at = COALESCE(processing_started_at, created_at)
 WHERE processing_started_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_webhook_events_status_started
  ON public.webhook_events (status, processing_started_at);

-- Default lease window: 5 minutes. Any webhook handler that cannot finish in
-- 5 minutes almost certainly died (Next.js route handlers are capped under
-- 60 seconds on most hosts); the lease is intentionally generous so that a
-- retry from Paystack (≥10 minute cadence) will be eligible to reclaim.
CREATE OR REPLACE FUNCTION public.try_acquire_webhook_event_lease(
  p_event_id   text,
  p_source     text,
  p_event_type text,
  p_payload    jsonb,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id                    uuid,
  status                text,
  acquired              boolean,
  already_processed     boolean,
  stale_lease_reclaimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing   public.webhook_events%ROWTYPE;
  v_now        timestamptz := now();
  v_stale_cut  timestamptz := now() - make_interval(secs => p_lease_seconds);
  v_new_id     uuid;
BEGIN
  -- Fast path: insert-if-absent, grab the lease.
  BEGIN
    INSERT INTO public.webhook_events (
      event_id, source, event_type, payload, status, processing_started_at
    ) VALUES (
      p_event_id, p_source, p_event_type, COALESCE(p_payload, '{}'::jsonb),
      'processing', v_now
    )
    RETURNING public.webhook_events.id INTO v_new_id;

    id                    := v_new_id;
    status                := 'processing';
    acquired              := true;
    already_processed     := false;
    stale_lease_reclaimed := false;
    RETURN NEXT;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    -- Fall through: existing row. Decide whether we can reclaim it.
    NULL;
  END;

  SELECT * INTO v_existing
  FROM public.webhook_events
  WHERE event_id = p_event_id
    AND source   = p_source
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Row went away between insert failure and select (extremely rare). Retry.
    RAISE EXCEPTION 'webhook_events row disappeared for %/%', p_source, p_event_id;
  END IF;

  IF v_existing.status = 'processed' THEN
    id                    := v_existing.id;
    status                := 'processed';
    acquired              := false;
    already_processed     := true;
    stale_lease_reclaimed := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_existing.status = 'failed' THEN
    -- A failed row is eligible for re-processing on retry. Reclaim.
    UPDATE public.webhook_events
       SET status                = 'processing',
           processing_started_at = v_now,
           error_message         = NULL
     WHERE id = v_existing.id;

    id                    := v_existing.id;
    status                := 'processing';
    acquired              := true;
    already_processed     := false;
    stale_lease_reclaimed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- status = 'processing'. Determine if the lease is stale.
  IF v_existing.processing_started_at IS NULL
     OR v_existing.processing_started_at < v_stale_cut THEN
    UPDATE public.webhook_events
       SET processing_started_at = v_now,
           error_message         = COALESCE(v_existing.error_message, 'reclaimed after stale lease')
     WHERE id = v_existing.id;

    id                    := v_existing.id;
    status                := 'processing';
    acquired              := true;
    already_processed     := false;
    stale_lease_reclaimed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Another live worker holds the lease; back off.
  id                    := v_existing.id;
  status                := 'processing';
  acquired              := false;
  already_processed     := false;
  stale_lease_reclaimed := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_webhook_event_lease(
  text, text, text, jsonb, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.try_acquire_webhook_event_lease(
  text, text, text, jsonb, integer
) TO service_role;

COMMIT;
