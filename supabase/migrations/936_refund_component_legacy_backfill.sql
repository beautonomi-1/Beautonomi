-- Finance audit: tag orphan refund ledger rows missing refund_component (GL + provider math).

UPDATE public.finance_transactions ft
SET refund_component = '_legacy'
WHERE ft.transaction_type = 'refund'
  AND ft.refund_component IS NULL;
