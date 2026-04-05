-- Optional ops: discover tables with tenant_id, then NULL counts for the money ledger set.
-- Wave 1.3 — see docs/IMPLEMENTATION_PLAN_MULTI_TENANT_REMAINING.md.
-- For production checks, prefer scripts/verify-tenant-money-invariants.sql (expect all zeros).

-- 1) All public tables that declare a tenant_id column
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;

-- 2) NULL tenant_id counts (same tables as verify-tenant-money-invariants.sql)
SELECT 'bookings' AS tbl, COUNT(*) AS null_tenant_rows
FROM public.bookings WHERE tenant_id IS NULL
UNION ALL
SELECT 'finance_transactions', COUNT(*) FROM public.finance_transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'membership_orders', COUNT(*) FROM public.membership_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'product_orders', COUNT(*) FROM public.product_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'provider_subscriptions', COUNT(*) FROM public.provider_subscriptions WHERE tenant_id IS NULL
UNION ALL
SELECT 'wallet_transactions', COUNT(*) FROM public.wallet_transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'gift_card_orders', COUNT(*) FROM public.gift_card_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments WHERE tenant_id IS NULL
UNION ALL
SELECT 'payment_webhook_events', COUNT(*) FROM public.payment_webhook_events WHERE tenant_id IS NULL
ORDER BY tbl;
