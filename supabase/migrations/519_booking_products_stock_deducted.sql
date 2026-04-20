-- 519_booking_products_stock_deducted.sql
--
-- §Provider-audit 2026-04: prior to this migration, adding retail products
-- to a booking ("add-on" sale at checkout) persisted rows into
-- `booking_products` but never decremented `products.quantity`. The only
-- stock mutation paths were `product_orders` (ecommerce / walk-in sales).
--
-- This column lets us idempotently deduct stock on booking completion and
-- safely re-increment on later cancellation of a completed booking.
--
-- Consumers: apps/web/src/app/api/provider/bookings/[id]/route.ts PATCH
-- path on status transitions to/from `completed`.
ALTER TABLE booking_products
    ADD COLUMN IF NOT EXISTS stock_deducted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN booking_products.stock_deducted_at IS
    'Timestamp when retail inventory was decremented for this line. NULL means stock has not been deducted yet (e.g. booking not completed, or a previous cancellation re-incremented it).';

CREATE INDEX IF NOT EXISTS idx_booking_products_stock_deducted
    ON booking_products(booking_id)
    WHERE stock_deducted_at IS NOT NULL;
