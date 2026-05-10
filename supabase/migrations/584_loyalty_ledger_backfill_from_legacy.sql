-- Backfill loyalty_points_ledger from legacy loyalty_point_transactions.
-- Idempotent: each legacy row is keyed by metadata->>'legacy_transaction_id'.
-- balance_after is computed from the merged timeline (existing ledger + legacy rows) per customer.

BEGIN;

WITH legacy_rows AS (
  SELECT
    lpt.id AS legacy_id,
    lpt.user_id AS customer_id,
    lpt.transaction_type::text AS transaction_type,
    CASE
      WHEN lpt.transaction_type IN ('redeemed', 'expired') THEN -ABS(lpt.points)
      ELSE lpt.points
    END AS points_amount,
    CASE
      WHEN lpt.reference_type IN ('booking', 'booking_refund') THEN lpt.reference_id
      ELSE NULL
    END AS booking_id,
    COALESCE(NULLIF(BTRIM(lpt.description), ''), 'Points transaction') AS description,
    lpt.expires_at,
    lpt.created_at
  FROM public.loyalty_point_transactions lpt
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.loyalty_points_ledger existing
    WHERE (existing.metadata ->> 'legacy_transaction_id') = lpt.id::text
  )
),
unioned AS (
  SELECT
    l.id::text AS row_key,
    l.customer_id,
    l.created_at,
    l.points_amount,
    l.transaction_type::text AS transaction_type,
    l.booking_id,
    l.description,
    l.expires_at,
    COALESCE(l.metadata, '{}'::jsonb) AS metadata,
    0 AS sort_src
  FROM public.loyalty_points_ledger l
  UNION ALL
  SELECT
    lr.legacy_id::text,
    lr.customer_id,
    lr.created_at,
    lr.points_amount,
    lr.transaction_type,
    lr.booking_id,
    lr.description,
    lr.expires_at,
    jsonb_build_object('legacy_transaction_id', lr.legacy_id::text) AS metadata,
    1 AS sort_src
  FROM legacy_rows lr
),
ordered AS (
  SELECT
    u.row_key,
    u.customer_id,
    u.created_at,
    u.points_amount,
    u.transaction_type,
    u.booking_id,
    u.description,
    u.expires_at,
    u.metadata,
    u.sort_src,
    SUM(u.points_amount) OVER (
      PARTITION BY u.customer_id
      ORDER BY u.created_at ASC, u.sort_src ASC, u.row_key
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
  FROM unioned u
)
INSERT INTO public.loyalty_points_ledger (
  customer_id,
  transaction_type,
  points_amount,
  balance_after,
  booking_id,
  description,
  expires_at,
  metadata,
  created_at
)
SELECT
  o.customer_id,
  o.transaction_type,
  o.points_amount,
  GREATEST(0, o.running_balance)::integer,
  o.booking_id,
  o.description,
  o.expires_at,
  o.metadata,
  o.created_at
FROM ordered o
WHERE o.sort_src = 1;

-- If any legacy row still lacks a mirrored ledger row (by legacy_transaction_id), log for ops follow-up.
DO $$
DECLARE
  v_leftover integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_leftover
  FROM public.loyalty_point_transactions lpt
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.loyalty_points_ledger l
    WHERE (l.metadata ->> 'legacy_transaction_id') = lpt.id::text
  );

  IF v_leftover > 0 THEN
    RAISE NOTICE 'loyalty_backfill_unmirrored_legacy_rows: % (investigate or re-run migration)', v_leftover;
  END IF;
END $$;

COMMIT;
