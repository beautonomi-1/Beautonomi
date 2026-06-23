-- §drain-backlog: One-off cleanup of the runaway reconcile delivery backlog.
--
-- The push-delivery reconciliation loop produced a large number of duplicate
-- notification_delivery_queue rows with `payload->'data'->>'reconciled' = 'true'`
-- and dedupe_keys matching `reconcile:push:%`. These rows will be retried by the
-- process-notification-queue cron indefinitely without this cleanup.
--
-- This migration dead-letters all pending/failed reconcile queue rows so the
-- storm stops immediately after the code fix is deployed.
--
-- Safe to re-run: only touches rows in a non-terminal status.

UPDATE public.notification_delivery_queue
SET
  status        = 'dead_letter',
  dead_lettered_at = NOW(),
  updated_at    = NOW(),
  last_error    = 'drain: reconcile backlog cleared by migration 712'
WHERE
  status IN ('pending', 'failed')
  AND (
    dedupe_key LIKE 'reconcile:push:%'
    -- Text compare (not ::boolean cast) so a stray non-boolean value can never
    -- abort the whole UPDATE. `reconciled` is only ever written as JSON true.
    OR payload->'data'->>'reconciled' = 'true'
  );
