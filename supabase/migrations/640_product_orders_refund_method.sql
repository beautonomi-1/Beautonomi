-- Record how a product order refund was returned to the customer, so provider
-- product-sale refunds match the in-person/wallet split we already support for
-- service bookings.
--
-- §Refund-audit 2026-05: previously PATCH /api/provider/product-orders/[id]
-- with status='refunded' merely flipped payment_status to 'refunded' with no
-- record of how much was returned, when, or by which method (cash handed back
-- at the counter vs. store credit added to the customer's wallet). Walk-in
-- product sales (customer_id NULL since migration 525) are almost always
-- refunded in person, while online orders refund to wallet. Capturing the
-- method lets receipts, reports, and the finance ledger reconcile correctly and
-- avoids silently issuing wallet credit to walk-ins who have no wallet.
--
-- Additive-only (nullable columns, no backfill) so existing refunded orders
-- continue to work unchanged.

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS refund_method TEXT
    CHECK (refund_method IS NULL OR refund_method IN ('cash', 'store_credit')),
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10, 2)
    CHECK (refunded_amount IS NULL OR refunded_amount >= 0),
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

COMMENT ON COLUMN public.product_orders.refund_method IS
  'How a refund was returned: ''cash'' (handed back in person, no wallet credit) or ''store_credit'' (added to the customer''s wallet). NULL until the order is refunded.';
COMMENT ON COLUMN public.product_orders.refunded_amount IS
  'Amount refunded to the customer when the order was marked refunded.';
COMMENT ON COLUMN public.product_orders.refunded_at IS
  'Timestamp the order was refunded.';
