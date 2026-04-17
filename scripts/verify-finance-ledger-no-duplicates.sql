-- F5/F20/F21 pre-flight reconciliation. Run BEFORE applying migrations 489/490.
--
-- Returns any finance_transactions rows that will be rejected by the new unique indexes.
-- If either query returns rows, clean them up manually before deploying.

-- 1. Duplicate (source_payment_id, transaction_type) rows.
SELECT
  source_payment_id,
  transaction_type,
  COUNT(*)            AS duplicate_count,
  array_agg(id ORDER BY created_at) AS row_ids
FROM public.finance_transactions
WHERE source_payment_id IS NOT NULL
GROUP BY source_payment_id, transaction_type
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. Existing refund rows without source_refund_id (would bypass the 490 idempotency guard).
SELECT
  booking_id,
  amount,
  created_at,
  description
FROM public.finance_transactions
WHERE transaction_type = 'refund'
  AND source_refund_id IS NULL
ORDER BY created_at DESC
LIMIT 100;

-- 3. booking_refunds rows with status='completed' that have no matching finance_transactions row.
SELECT
  br.id           AS booking_refund_id,
  br.booking_id,
  br.amount,
  br.status,
  br.created_at
FROM public.booking_refunds br
LEFT JOIN public.finance_transactions ft ON ft.source_refund_id = br.id
WHERE br.status = 'completed'
  AND ft.id IS NULL
ORDER BY br.created_at DESC
LIMIT 100;
