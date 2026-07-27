-- =============================================================================
-- Fleet scan: diluted balance top-up provider_earnings
-- Run in Supabase SQL editor (read-only). Review rows before any repair.
-- Pattern: booking edited after first payment; booking-level legs already posted;
-- a later payment gets provider_earnings = payment × net_ratio instead of residual.
-- =============================================================================

WITH booking_payments_completed AS (
  SELECT
    bp.id AS payment_id,
    bp.booking_id,
    bp.amount AS payment_amount,
    bp.payment_provider,
    bp.payment_method,
    bp.created_at AS paid_at,
    bp.payment_provider_id
  FROM public.booking_payments bp
  WHERE bp.status IN ('completed', 'partially_refunded')
),
multi_pay_bookings AS (
  SELECT booking_id
  FROM booking_payments_completed
  GROUP BY booking_id
  HAVING COUNT(*) > 1
),
booking_totals AS (
  SELECT
    b.id AS booking_id,
    b.booking_number,
    b.version,
    b.subtotal,
    b.total_amount,
    COALESCE(b.travel_fee, 0) AS travel_fee,
    COALESCE(b.tax_amount, 0) AS tax_amount,
    COALESCE(NULLIF(b.platform_fee_amount, 0), b.service_fee_amount, 0) AS platform_fee,
    COALESCE(b.tip_amount, 0) AS tip_amount
  FROM public.bookings b
  JOIN multi_pay_bookings mp ON mp.booking_id = b.id
),
ledger_by_payment AS (
  SELECT
    ft.source_payment_id AS payment_id,
    ft.booking_id,
    COALESCE(SUM(ft.net) FILTER (WHERE ft.transaction_type = 'provider_earnings'), 0) AS posted_earnings
  FROM public.finance_transactions ft
  WHERE ft.booking_id IS NOT NULL
  GROUP BY ft.source_payment_id, ft.booking_id
),
booking_level_posted AS (
  SELECT DISTINCT ft.booking_id
  FROM public.finance_transactions ft
  WHERE ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'platform_fee', 'service_fee')
),
expected AS (
  SELECT
    pc.payment_id,
    pc.booking_id,
    bt.booking_number,
    pc.payment_amount,
    pc.payment_provider,
    pc.paid_at,
    bt.total_amount AS booking_total_now,
    bt.subtotal AS subtotal_now,
    CASE
      WHEN bt.total_amount > 0 THEN
        GREATEST(
          0,
          (bt.total_amount - bt.tip_amount - bt.tax_amount - bt.travel_fee - bt.platform_fee)
            / bt.total_amount
        )
      ELSE 1
    END AS net_ratio,
    CASE
      WHEN blp.booking_id IS NOT NULL THEN
        GREATEST(
          0,
          pc.payment_amount
            - GREATEST(
                0,
                COALESCE(
                  (
                    SELECT COALESCE(SUM(bp2.amount), 0)
                    FROM booking_payments_completed bp2
                    WHERE bp2.booking_id = pc.booking_id
                      AND bp2.paid_at < pc.paid_at
                  ),
                  0
                )
                - COALESCE(
                    (
                      SELECT COALESCE(SUM(ft2.net), 0)
                      FROM public.finance_transactions ft2
                      WHERE ft2.booking_id = pc.booking_id
                        AND ft2.transaction_type IN (
                          'provider_earnings',
                          'payment',
                          'platform_fee',
                          'service_fee',
                          'tip',
                          'tax',
                          'travel_fee'
                        )
                        AND ft2.net > 0
                        AND (ft2.source_payment_id IS NULL OR ft2.source_payment_id <> pc.payment_id)
                    ),
                    0
                  )
              )
        )
      ELSE ROUND(pc.payment_amount * CASE
        WHEN bt.total_amount > 0 THEN
          GREATEST(
            0,
            (bt.total_amount - bt.tip_amount - bt.tax_amount - bt.travel_fee - bt.platform_fee)
              / bt.total_amount
          )
        ELSE 1
      END, 2)
    END AS expected_earnings,
    COALESCE(lbp.posted_earnings, 0) AS posted_earnings,
    blp.booking_id IS NOT NULL AS booking_level_already_posted
  FROM booking_payments_completed pc
  JOIN booking_totals bt ON bt.booking_id = pc.booking_id
  LEFT JOIN ledger_by_payment lbp
    ON lbp.payment_id = pc.payment_id AND lbp.booking_id = pc.booking_id
  LEFT JOIN booking_level_posted blp ON blp.booking_id = pc.booking_id
)
SELECT
  e.booking_number,
  e.payment_id,
  e.payment_provider,
  e.payment_amount,
  e.paid_at,
  e.booking_total_now,
  e.subtotal_now,
  e.booking_level_already_posted,
  ROUND(e.expected_earnings::numeric, 2) AS expected_earnings,
  ROUND(e.posted_earnings::numeric, 2) AS posted_earnings,
  ROUND((e.expected_earnings - e.posted_earnings)::numeric, 2) AS earnings_diff,
  CASE
    WHEN ABS(e.expected_earnings - e.posted_earnings) > 0.02 THEN 'DILUTED_OR_MISSING'
    ELSE 'OK'
  END AS verdict
FROM expected e
WHERE e.booking_level_already_posted
  AND ABS(e.expected_earnings - e.posted_earnings) > 0.02
ORDER BY e.paid_at DESC;
