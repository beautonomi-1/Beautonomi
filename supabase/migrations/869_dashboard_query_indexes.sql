-- Composite indexes for hot provider dashboard queries (upcoming schedule + ledger).

CREATE INDEX IF NOT EXISTS idx_bookings_provider_scheduled_at
  ON public.bookings (provider_id, scheduled_at DESC)
  WHERE group_booking_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_bookings_provider_scheduled_at
  ON public.group_bookings (provider_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_provider_created_at
  ON public.finance_transactions (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_payments_status_created_at
  ON public.booking_payments (status, created_at DESC)
  WHERE status = 'completed';

-- Part M P0 composites for the hottest provider-dashboard / reconcile filters.
-- NOTE: the Supabase migration runner wraps each file in a transaction, so
-- CREATE INDEX CONCURRENTLY is not available here (it cannot run inside a
-- transaction block). These are plain CREATE INDEX IF NOT EXISTS; run them
-- CONCURRENTLY by hand on a very large production table if lock time matters.

-- Ledger sums by type within a date window (dashboard tiles, finance summary RPC).
CREATE INDEX IF NOT EXISTS idx_finance_transactions_provider_type_created_at
  ON public.finance_transactions (provider_id, transaction_type, created_at DESC);

-- Status tiles + schedule counts (provider_dashboard_snapshot RPC).
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status_scheduled_at
  ON public.bookings (provider_id, status, scheduled_at);

-- Payment truth lookups per booking (unrecognized payments, reconcile cron).
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_status
  ON public.booking_payments (booking_id, status);

-- Additional-charge state per booking (pending banner, settlement).
CREATE INDEX IF NOT EXISTS idx_additional_charges_booking_status
  ON public.additional_charges (booking_id, status);

-- Webhook forensics / prune cron.
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created_at
  ON public.webhook_events (status, created_at);
