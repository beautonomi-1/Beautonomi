-- Void open platform-fee / commission provider invoices (fees already retained at checkout)
-- and fail pending EFT claims so card checkout cannot double-settle.

UPDATE provider_invoices
SET
  status = 'cancelled',
  notes = COALESCE(notes, '') || E'\n[void] Platform fees are customer-paid and retained at checkout (migration 1025).',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'void_reason', 'already_retained_at_checkout',
    'voided_at', to_jsonb(now())
  ) || CASE
    WHEN COALESCE(amount_paid, 0) > 0 THEN jsonb_build_object('refund_review_required', true)
    ELSE '{}'::jsonb
  END,
  updated_at = NOW()
WHERE invoice_type IN ('platform_fee', 'commission')
  AND status IN ('draft', 'sent', 'partially_paid', 'overdue');

UPDATE provider_invoice_payments pip
SET
  status = 'failed',
  failure_reason = 'Bank transfer claims are no longer accepted; pay invoices online (migration 1025).',
  updated_at = NOW()
WHERE pip.status IN ('pending', 'processing');

COMMENT ON TABLE provider_invoices IS
  'Invoices Beautonomi sends to providers for subscriptions, transaction fees, and other staff-raised charges — not customer-paid platform fees.';

COMMENT ON COLUMN provider_invoices.invoice_type IS
  'Type: subscription, transaction_fee, other (payable). platform_fee and commission are legacy and not billable to providers.';
