-- Idempotent staging repair: post payment + finance legs for paid wallet
-- top-ups that never reached the ledger. Does not credit the wallet again.
SELECT public.repair_paid_wallet_topup_missing_ledger(wt.id) AS repair
  FROM public.wallet_topups wt
 WHERE wt.status = 'paid'
   AND NOT EXISTS (
     SELECT 1
       FROM public.finance_transactions ft
      WHERE ft.transaction_type = 'wallet_topup'
        AND (
          ft.metadata->>'wallet_topup_id' = wt.id::text
          OR ft.description = 'Wallet topup: ' || wt.id::text
        )
   );
