-- Wave 3.1 (audit 2026-04 final 100/100): notification queue dedupe key.
--
-- Adds an optional `dedupe_key` column + partial unique index so
-- application code can safely call enqueueNotification() multiple times
-- for the same "logical" event (booking confirmed, appointment reminder,
-- payout paid, etc.) without creating duplicate queue rows while an
-- identical delivery is still pending / in-flight / failed-retryable.
--
-- The index is partial (only active states) so that once a notification
-- has been delivered or dead-lettered the same dedupe key can be reused
-- in the future (e.g. re-sending a reminder the following day).

ALTER TABLE public.notification_delivery_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_queue_dedupe_active
  ON public.notification_delivery_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('pending', 'failed', 'in_flight');

COMMENT ON COLUMN public.notification_delivery_queue.dedupe_key IS
  'Wave 3.1: optional caller-chosen idempotency key. A second insert '
  'with the same dedupe_key while the original row is still pending / '
  'in_flight / failed will conflict on ux_notification_queue_dedupe_active '
  'and be rejected, preventing duplicate deliveries from producer retries.';
