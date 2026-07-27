-- Clarify finance_transactions single-writer contract (migration 489 comment was stale).
COMMENT ON INDEX public.ux_finance_transactions_source_payment_per_type IS
  'Single-writer contract for finance_transactions rows tied to booking_payments via source_payment_id. '
  'The create_finance_ledger_from_payment trigger writes these for offline and provider-collected tenders. '
  'Platform gateway webhooks (Paystack, Stripe, Flutterwave) write finance rows without source_payment_id '
  'or with source_payment_id when a booking_payments row exists — app code must not duplicate '
  'trigger-written rows for the same payment.';
