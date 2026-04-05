-- =============================================================================
-- Money-path verification after migrations 376–386 (and prerequisites)
-- =============================================================================
--
-- Apply order (repo): 376 → 377 → 378 → 379 → 380 → 381_00 → 381_booking →
--   382 → 383 → 384 → 385 → 386
-- Prerequisites: tenant model / bookings NOT NULL tenant_id (e.g. **333**),
--   `payment_webhook_events` table (**334**).
--
-- PASS CRITERIA (per environment: staging + prod):
--   1. All migrations above are applied successfully.
--   2. Query (A) below: every row has null_tenant_rows = 0.
--   3. Query (B) below: total_null_tenant_rows = 0.
--
-- Not listed (by design — no tenant_id column):
--   payment_transactions — UNIQUE(provider, reference); see docs/PAYMENT_TRANSACTIONS_ACCESS.md
--
-- Run in Supabase SQL editor or psql against the target database.

-- (A) Per-table NULL counts — each must be 0
SELECT 'bookings' AS tbl, COUNT(*)::bigint AS null_tenant_rows
FROM public.bookings WHERE tenant_id IS NULL
UNION ALL
SELECT 'finance_transactions', COUNT(*)::bigint FROM public.finance_transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'membership_orders', COUNT(*)::bigint FROM public.membership_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'product_orders', COUNT(*)::bigint FROM public.product_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'provider_subscriptions', COUNT(*)::bigint FROM public.provider_subscriptions WHERE tenant_id IS NULL
UNION ALL
SELECT 'wallet_transactions', COUNT(*)::bigint FROM public.wallet_transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'gift_card_orders', COUNT(*)::bigint FROM public.gift_card_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'booking_payments', COUNT(*)::bigint FROM public.booking_payments WHERE tenant_id IS NULL
UNION ALL
SELECT 'payment_webhook_events', COUNT(*)::bigint FROM public.payment_webhook_events WHERE tenant_id IS NULL
ORDER BY tbl;

-- (B) Single total — must be 0 for PASS
SELECT COALESCE(
  (SELECT COUNT(*) FROM public.bookings WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.finance_transactions WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.membership_orders WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.product_orders WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.provider_subscriptions WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.wallet_transactions WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.gift_card_orders WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.booking_payments WHERE tenant_id IS NULL), 0
) + COALESCE(
  (SELECT COUNT(*) FROM public.payment_webhook_events WHERE tenant_id IS NULL), 0
) AS total_null_tenant_rows;
