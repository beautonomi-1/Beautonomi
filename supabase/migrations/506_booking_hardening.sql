-- 506_booking_hardening.sql
--
-- Implements the §15.4 "Hardening" bucket from
-- docs/audits/BOOKING_SYSTEM_PRODUCTION_AUDIT_2026-04.md:
--
--   (24) Server-side idempotency key on POST /api/public/bookings.
--   (25) Durable retry queue for notifications (with DLQ semantics).
--   (27) Abandoned-booking cron needs a place to record re-engagement state
--        so it cannot spam a customer on every sweep.
--   (30) 24h reconciliation gate needs a durable record of imbalance runs.
--
-- All tables default to service_role-only access. Every RPC below is called
-- by server-side cron or POST routes using the admin client; no end-user
-- facing surface reads these tables directly.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (24) Request idempotency keys — covers POST /api/public/bookings and can
-- be reused by any route that needs "once-per-client-key" dedup.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.request_idempotency_keys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   text        NOT NULL,
  endpoint          text        NOT NULL,      -- e.g. 'POST /api/public/bookings'
  tenant_id         uuid        NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid        NULL REFERENCES public.users(id)   ON DELETE SET NULL,
  request_hash      text        NULL,          -- sha256 of the request body
  response_status   int         NULL,
  response_body     jsonb       NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_request_idempotency_expires
  ON public.request_idempotency_keys (expires_at);

ALTER TABLE public.request_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS request_idempotency_keys_service_role
  ON public.request_idempotency_keys;

CREATE POLICY request_idempotency_keys_service_role
  ON public.request_idempotency_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.request_idempotency_keys IS
  '§15.4 (audit 2026-04): server-side idempotency ledger. Accepts a client-'
  'supplied UUID as `idempotency_key`; the route stores the response the first '
  'time and returns the cached response for every subsequent request with the '
  'same (endpoint, idempotency_key). Expired rows (> expires_at) are pruned by '
  'the daily cron.';

CREATE OR REPLACE FUNCTION public.prune_expired_idempotency_keys()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.request_idempotency_keys
   WHERE expires_at < now()
  RETURNING 1 INTO v_deleted;
  RETURN COALESCE(v_deleted, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.prune_expired_idempotency_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_expired_idempotency_keys() TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- (25) Notification delivery queue + attempt log
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_delivery_status') THEN
    CREATE TYPE public.notification_delivery_status AS ENUM (
      'pending',
      'in_flight',
      'delivered',
      'failed',
      'dead_letter'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.notification_delivery_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id    uuid NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  booking_id         uuid NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  recipient_user_id  uuid NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel            text NOT NULL CHECK (channel IN ('email', 'push', 'sms', 'in_app')),
  template_key       text NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             public.notification_delivery_status NOT NULL DEFAULT 'pending',
  attempts           int  NOT NULL DEFAULT 0,
  max_attempts       int  NOT NULL DEFAULT 5,
  last_error         text NULL,
  next_attempt_at    timestamptz NOT NULL DEFAULT now(),
  last_attempt_at    timestamptz NULL,
  delivered_at       timestamptz NULL,
  dead_lettered_at   timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notification_queue_pending
  ON public.notification_delivery_queue (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS ix_notification_queue_booking
  ON public.notification_delivery_queue (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.notification_delivery_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_queue_service_role
  ON public.notification_delivery_queue;

CREATE POLICY notification_delivery_queue_service_role
  ON public.notification_delivery_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.notification_delivery_queue IS
  '§15.4 (audit 2026-04): durable delivery queue for customer/provider '
  'notifications. Producers insert rows in `pending`; the retry cron flips '
  'them through `in_flight` → `delivered`/`failed`. After max_attempts the '
  'row moves to `dead_letter` and stops retrying.';


-- ───────────────────────────────────────────────────────────────────────────
-- (27) Abandoned-booking re-engagement log (idempotency per (hold, purpose))
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.abandoned_booking_reengagement (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id          uuid NULL REFERENCES public.booking_holds(id) ON DELETE CASCADE,
  user_id          uuid NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  purpose          text NOT NULL,         -- e.g. 'hold_expired_reminder'
  sent_at          timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (hold_id, purpose)
);

ALTER TABLE public.abandoned_booking_reengagement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandoned_reengagement_service_role
  ON public.abandoned_booking_reengagement;

CREATE POLICY abandoned_reengagement_service_role
  ON public.abandoned_booking_reengagement
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ───────────────────────────────────────────────────────────────────────────
-- (30) Reconciliation gate runs — durable record so feature flags can gate
-- on "last run balanced".
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reconciliation_gate_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('balanced', 'drifted', 'error')),
  drift_rows      int  NOT NULL DEFAULT 0,
  drift_summary   jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes           text NULL
);

CREATE INDEX IF NOT EXISTS ix_reconciliation_runs_checked_at
  ON public.reconciliation_gate_runs (checked_at DESC);

ALTER TABLE public.reconciliation_gate_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_runs_service_role
  ON public.reconciliation_gate_runs;

CREATE POLICY reconciliation_runs_service_role
  ON public.reconciliation_gate_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS reconciliation_runs_superadmin_read
  ON public.reconciliation_gate_runs;

CREATE POLICY reconciliation_runs_superadmin_read
  ON public.reconciliation_gate_runs
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

COMMENT ON TABLE public.reconciliation_gate_runs IS
  '§15.4 (audit 2026-04): records the result of each scheduled '
  'ledger_reconciliation_summary check so feature flags / rollout gates can '
  'refuse to advance unless the most recent run is `balanced`.';

COMMIT;
