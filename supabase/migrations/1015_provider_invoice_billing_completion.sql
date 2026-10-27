-- Provider invoice balance trigger, overdue tracking, billing activity view.

ALTER TABLE provider_invoices
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION update_invoice_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  inv_id UUID;
  inv_total NUMERIC(10, 2);
  inv_due_date DATE;
  inv_status TEXT;
  paid_sum NUMERIC(10, 2);
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT total_amount, due_date, status
  INTO inv_total, inv_due_date, inv_status
  FROM provider_invoices
  WHERE id = inv_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO paid_sum
  FROM provider_invoice_payments
  WHERE invoice_id = inv_id
    AND status = 'completed';

  UPDATE provider_invoices
  SET amount_paid = paid_sum,
      status = CASE
        WHEN inv_status IN ('draft', 'cancelled', 'refunded') THEN inv_status
        WHEN paid_sum >= inv_total THEN 'paid'
        WHEN paid_sum > 0 AND inv_due_date < CURRENT_DATE THEN 'overdue'
        WHEN paid_sum > 0 THEN 'partially_paid'
        WHEN inv_status IN ('sent', 'partially_paid', 'overdue')
             AND inv_due_date < CURRENT_DATE THEN 'overdue'
        WHEN inv_status IN ('sent', 'partially_paid', 'overdue') THEN 'sent'
        ELSE inv_status
      END
  WHERE id = inv_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- One pending EFT claim per invoice at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_one_pending_per_invoice
  ON provider_invoice_payments (invoice_id)
  WHERE status = 'pending';

INSERT INTO public.notification_templates (
  tenant_id,
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  variables,
  url,
  enabled,
  description
)
VALUES
  (
    NULL,
    'provider_invoice_overdue',
    'Invoice Overdue',
    'Invoice {{invoice_number}} for {{total_amount}} was due {{due_date}} and is still outstanding.',
    ARRAY['push', 'email']::TEXT[],
    'Overdue: Invoice {{invoice_number}}',
    '<h2>Invoice overdue</h2><p>Invoice <strong>{{invoice_number}}</strong> for {{total_amount}} was due on {{due_date}}.</p><p>Please pay in the Billing section of the Beautonomi app.</p>',
    ARRAY['invoice_number', 'total_amount', 'due_date', 'amount_due']::TEXT[],
    '/provider/settings/billing',
    true,
    'Sent once when a platform invoice passes its due date with an outstanding balance'
  )
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();

CREATE OR REPLACE VIEW provider_billing_activity AS
SELECT
  ft.id AS id,
  ft.provider_id,
  COALESCE(ft.net, 0) + COALESCE(ft.fees, 0) AS amount,
  COALESCE(ft.currency, 'ZAR') AS currency,
  CASE
    WHEN ft.transaction_type = 'provider_marketing_credit_refund' THEN 'refunded'
    ELSE 'paid'
  END AS status,
  CASE
    WHEN ft.transaction_type = 'provider_subscription_payment' THEN 'subscription'
    WHEN ft.transaction_type = 'provider_ads_payment' THEN 'ads'
    WHEN ft.transaction_type = 'provider_marketing_credit_topup' THEN 'marketing_credit'
    WHEN ft.transaction_type = 'provider_marketing_credit_refund' THEN 'marketing_credit'
    ELSE 'other'
  END AS type,
  CASE
    WHEN ft.transaction_type = 'provider_marketing_credit_refund' THEN 'refund'
    ELSE 'charge'
  END AS direction,
  COALESCE(
    ft.description,
    (ft.metadata->>'description'),
    ft.transaction_type
  ) AS description,
  ft.created_at AS occurred_at,
  CASE
    WHEN ft.transaction_type = 'provider_subscription_payment' THEN
      '/api/provider/subscription/receipts/' || ft.id::text || '/pdf'
    WHEN ft.transaction_type = 'provider_ads_payment'
         AND (ft.metadata->>'ads_budget_order_id') IS NOT NULL THEN
      '/api/provider/ads/orders/' || (ft.metadata->>'ads_budget_order_id') || '/receipt/pdf'
    WHEN ft.transaction_type = 'provider_ads_payment' THEN
      '/api/provider/subscription/receipts/' || ft.id::text || '/pdf'
    WHEN ft.transaction_type IN (
      'provider_marketing_credit_topup',
      'provider_marketing_credit_refund'
    ) THEN
      '/api/provider/finance/marketing-credit/receipts/' || ft.id::text || '/pdf'
    ELSE NULL
  END AS receipt_path,
  'finance_transaction'::text AS source_kind
FROM finance_transactions ft
WHERE ft.transaction_type IN (
  'provider_subscription_payment',
  'provider_ads_payment',
  'provider_marketing_credit_topup',
  'provider_marketing_credit_refund'
)
UNION ALL
SELECT
  pip.id AS id,
  pi.provider_id,
  pip.amount,
  COALESCE(pi.currency, 'ZAR') AS currency,
  CASE WHEN pip.status = 'refunded' THEN 'refunded' ELSE 'paid' END AS status,
  'platform_invoice'::text AS type,
  CASE WHEN pip.status = 'refunded' THEN 'refund' ELSE 'charge' END AS direction,
  COALESCE(
    'Invoice ' || pi.invoice_number,
    pi.description,
    'Platform invoice payment'
  ) AS description,
  (pip.payment_date::timestamptz AT TIME ZONE 'UTC') AS occurred_at,
  '/api/provider/invoices/' || pi.id::text || '/download' AS receipt_path,
  'invoice_payment'::text AS source_kind
FROM provider_invoice_payments pip
JOIN provider_invoices pi ON pi.id = pip.invoice_id
WHERE pip.status IN ('completed', 'refunded');
