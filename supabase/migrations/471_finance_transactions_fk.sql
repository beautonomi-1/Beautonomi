-- Add FK from finance_transactions to booking_payments for referential integrity.
-- (Numbered 471: 470 is provider_subscriptions_paystack_sync.)
-- Uses IF NOT EXISTS pattern for safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_finance_transactions_source_payment'
    AND table_name = 'finance_transactions'
  ) THEN
    -- Only add if the column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'finance_transactions' AND column_name = 'source_payment_id'
    ) THEN
      ALTER TABLE finance_transactions
        ADD CONSTRAINT fk_finance_transactions_source_payment
        FOREIGN KEY (source_payment_id) REFERENCES booking_payments(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
