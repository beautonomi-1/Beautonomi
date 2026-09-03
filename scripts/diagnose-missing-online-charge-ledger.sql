-- =============================================================================
-- Diagnose missing online-charge finance ledger rows
-- Run in Supabase SQL editor (read-only). Review before repair script.
-- =============================================================================

WITH paid_addons AS (
  SELECT
    ac.booking_id,
    COALESCE(SUM(ac.amount) FILTER (WHERE ac.status = 'paid'), 0) AS paid_addon_total
  FROM public.additional_charges ac
  GROUP BY ac.booking_id
),
bp AS (
  SELECT
    bp.id AS booking_payment_id,
    bp.booking_id,
    bp.amount,
    bp.payment_provider,
    bp.payment_method,
    bp.payment_provider_id,
    bp.payment_provider_data,
    bp.created_at,
    b.booking_number,
    b.status AS booking_status,
    b.total_amount,
    b.payment_option,
    COALESCE(pa.paid_addon_total, 0) AS paid_addons,
    (b.total_amount - COALESCE(pa.paid_addon_total, 0)) AS original_checkout_total
  FROM public.booking_payments bp
  JOIN public.bookings b ON b.id = bp.booking_id
  LEFT JOIN paid_addons pa ON pa.booking_id = bp.booking_id
  WHERE bp.status = 'completed'
    AND bp.payment_provider IN ('paystack', 'stripe', 'flutterwave', 'yoco', 'paycloud')
),
has_payment_ft AS (
  SELECT DISTINCT
    ft.booking_id,
    ft.source_payment_id
  FROM public.finance_transactions ft
  WHERE ft.transaction_type = 'payment'
    AND ft.description NOT ILIKE '%additional charge%'
),
predates_attribution AS (
  SELECT DISTINCT ft.booking_id
  FROM public.finance_transactions ft
  WHERE ft.transaction_type = 'payment'
    AND ft.source_payment_id IS NULL
),
refunded AS (
  SELECT DISTINCT br.booking_id
  FROM public.booking_refunds br
),
diagnosis AS (
  SELECT
    bp.*,
    EXISTS (
      SELECT 1 FROM has_payment_ft h
      WHERE h.booking_id = bp.booking_id
        AND h.source_payment_id = bp.booking_payment_id
    ) AS has_ledger_payment,
    EXISTS (SELECT 1 FROM predates_attribution p WHERE p.booking_id = bp.booking_id) AS predates_source_attribution,
    EXISTS (SELECT 1 FROM refunded r WHERE r.booking_id = bp.booking_id) AS has_refunds,
    (
      bp.payment_provider IN ('paystack', 'stripe', 'flutterwave')
      AND bp.booking_status NOT IN ('cancelled', 'no_show')
      AND NOT EXISTS (SELECT 1 FROM refunded r WHERE r.booking_id = bp.booking_id)
      AND NOT EXISTS (SELECT 1 FROM predates_attribution p WHERE p.booking_id = bp.booking_id)
      AND ABS(bp.amount - bp.original_checkout_total) < 0.02
      AND COALESCE((bp.payment_provider_data->>'requires_deposit')::boolean, false) = false
      AND COALESCE(bp.payment_provider_data->>'payment_option', bp.payment_option, 'full') = 'full'
    ) AS safe_to_auto_backfill
  FROM bp
)
SELECT *
FROM diagnosis
WHERE NOT has_ledger_payment
ORDER BY created_at DESC;
