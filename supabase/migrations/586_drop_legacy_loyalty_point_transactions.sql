-- Retire legacy loyalty store; canonical data lives in loyalty_points_ledger.
-- get_user_loyalty_balance (migration 585) already delegates to get_customer_available_points.

BEGIN;

DROP TABLE IF EXISTS public.loyalty_point_transactions CASCADE;

COMMIT;
