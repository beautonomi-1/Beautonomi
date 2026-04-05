-- Backfill finance_transactions.provider_id for gift card sales issued before webhook set it.
-- Matches Paystack success rows (payment_transactions.metadata.kind = gift_card_order) to ledger rows by amount + time.

WITH candidates AS (
  SELECT
    ft.id AS ft_id,
    o.provider_id,
    abs(extract(epoch FROM (ft.created_at - pt.created_at))) AS tdiff
  FROM public.finance_transactions ft
  INNER JOIN public.payment_transactions pt
    ON pt.metadata->>'kind' = 'gift_card_order'
    AND pt.status = 'success'
    AND (pt.metadata->>'gift_card_order_id') IS NOT NULL
    AND abs(ft.amount - pt.amount) < 0.02
    AND abs(extract(epoch FROM (ft.created_at - pt.created_at))) < 300
  INNER JOIN public.gift_card_orders o
    ON o.id = (pt.metadata->>'gift_card_order_id')::uuid
    AND o.status = 'paid'
    AND o.provider_id IS NOT NULL
  WHERE ft.transaction_type = 'gift_card_sale'
    AND ft.provider_id IS NULL
    AND ft.booking_id IS NULL
),
picked AS (
  SELECT DISTINCT ON (ft_id)
    ft_id,
    provider_id
  FROM candidates
  ORDER BY ft_id, tdiff ASC
)
UPDATE public.finance_transactions ft
SET provider_id = p.provider_id
FROM picked p
WHERE ft.id = p.ft_id;
