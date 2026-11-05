-- Group booking money safety: one-off historical audit (READ ONLY).
-- Run in the Supabase SQL editor against production with a read-only role.
-- Share the results with the owner before any clawback. Nothing here writes.
--
-- Rail classification mirrors apps/web/src/lib/bookings/payment-collected-classifier.ts:
--   online    = wallet / gift_card, or provider in (paystack, flutterwave, stripe) and method <> paystack_terminal
--   in person = cash, paycloud, yoco, paystack_terminal, bank_transfer, eft, other, manual, card without a platform provider

-- 1. Wallet (store credit) refunds that exceed the booking's online-collected share.
WITH pay AS (
  SELECT
    bp.booking_id,
    SUM(bp.amount) FILTER (
      WHERE lower(coalesce(bp.payment_method, '')) IN ('wallet', 'gift_card')
         OR (lower(coalesce(bp.payment_provider, '')) IN ('paystack', 'flutterwave', 'stripe')
             AND lower(coalesce(bp.payment_method, '')) <> 'paystack_terminal')
    ) AS online_collected,
    SUM(bp.amount) FILTER (
      WHERE lower(coalesce(bp.payment_method, '')) IN ('cash', 'paystack_terminal', 'bank_transfer', 'eft', 'other', 'manual')
         OR lower(coalesce(bp.payment_provider, '')) IN ('cash', 'paycloud', 'yoco')
         OR (lower(coalesce(bp.payment_method, '')) = 'card'
             AND lower(coalesce(bp.payment_provider, '')) NOT IN ('paystack', 'flutterwave', 'stripe'))
    ) AS in_person_collected
  FROM booking_payments bp
  WHERE bp.status IN ('completed', 'partially_refunded')
  GROUP BY bp.booking_id
),
wallet_refunds AS (
  SELECT br.booking_id, SUM(br.amount) AS wallet_refunded, MIN(br.created_at) AS first_at, MAX(br.created_at) AS last_at,
         array_agg(DISTINCT br.created_by) AS refunded_by
  FROM booking_refunds br
  WHERE br.refund_method IN ('store_credit', 'wallet')
    AND br.status IN ('completed', 'pending')
  GROUP BY br.booking_id
)
SELECT
  b.provider_id,
  b.id AS booking_id,
  b.group_booking_id,
  coalesce(p.online_collected, 0) AS online_collected,
  coalesce(p.in_person_collected, 0) AS in_person_collected,
  wr.wallet_refunded,
  GREATEST(wr.wallet_refunded - coalesce(p.online_collected, 0), 0) AS wallet_over_online,
  wr.refunded_by,
  wr.first_at,
  wr.last_at
FROM wallet_refunds wr
JOIN bookings b ON b.id = wr.booking_id
LEFT JOIN pay p ON p.booking_id = wr.booking_id
WHERE wr.wallet_refunded > coalesce(p.online_collected, 0) + 0.01
ORDER BY wallet_over_online DESC, wr.last_at DESC;

-- 1b. Totals per provider for the rows above.
WITH pay AS (
  SELECT
    bp.booking_id,
    SUM(bp.amount) FILTER (
      WHERE lower(coalesce(bp.payment_method, '')) IN ('wallet', 'gift_card')
         OR (lower(coalesce(bp.payment_provider, '')) IN ('paystack', 'flutterwave', 'stripe')
             AND lower(coalesce(bp.payment_method, '')) <> 'paystack_terminal')
    ) AS online_collected
  FROM booking_payments bp
  WHERE bp.status IN ('completed', 'partially_refunded')
  GROUP BY bp.booking_id
),
wallet_refunds AS (
  SELECT br.booking_id, SUM(br.amount) AS wallet_refunded
  FROM booking_refunds br
  WHERE br.refund_method IN ('store_credit', 'wallet')
    AND br.status IN ('completed', 'pending')
  GROUP BY br.booking_id
)
SELECT
  b.provider_id,
  COUNT(*) AS bookings_flagged,
  SUM(GREATEST(wr.wallet_refunded - coalesce(p.online_collected, 0), 0)) AS total_wallet_over_online
FROM wallet_refunds wr
JOIN bookings b ON b.id = wr.booking_id
LEFT JOIN pay p ON p.booking_id = wr.booking_id
WHERE wr.wallet_refunded > coalesce(p.online_collected, 0) + 0.01
GROUP BY b.provider_id
ORDER BY total_wallet_over_online DESC;

-- 2. Group mark_paid rows recorded as Yoco with no Yoco transaction reference.
SELECT
  b.provider_id,
  b.group_booking_id,
  bp.booking_id,
  bp.id AS booking_payment_id,
  bp.amount,
  bp.payment_method,
  bp.notes,
  bp.created_by,
  bp.created_at
FROM booking_payments bp
JOIN bookings b ON b.id = bp.booking_id
WHERE b.group_booking_id IS NOT NULL
  AND lower(coalesce(bp.payment_provider, '')) = 'yoco'
  AND bp.payment_provider_id IS NULL
  AND bp.status IN ('completed', 'partially_refunded')
ORDER BY bp.created_at DESC;

-- 3. Completed child bookings in groups where the child was fully refunded (completed after refund).
SELECT
  b.provider_id,
  b.group_booking_id,
  b.id AS booking_id,
  b.status,
  b.payment_status,
  b.total_paid,
  b.total_refunded,
  b.completed_at
FROM bookings b
WHERE b.group_booking_id IS NOT NULL
  AND b.status = 'completed'
  AND (b.payment_status = 'refunded' OR (b.total_paid > 0 AND b.total_refunded >= b.total_paid - 0.01))
ORDER BY b.completed_at DESC NULLS LAST;
