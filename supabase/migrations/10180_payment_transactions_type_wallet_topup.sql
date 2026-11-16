-- payment_transactions_transaction_type_check (024) only allowed
-- charge / refund / additional_charge. Wallet top-ups ('wallet_topup') and
-- provider subscription renewals ('provider_subscription_payment') were
-- rejected with 23514, so their receipt rows were never stored and
-- /api/paystack/verify returned 500 after the wallet had already been credited.

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_transaction_type_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'charge',
    'refund',
    'additional_charge',
    'wallet_topup',
    'provider_subscription_payment'
  ));
