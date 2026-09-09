-- Platform invoices (Beautonomi → provider) become payable online.
--
-- 1. Idempotency for gateway-driven payments: a Paystack reference may be
--    delivered by both the webhook and the client verify call, and neither can
--    be allowed to double-credit an invoice.
-- 2. Issuance bookkeeping so the scheduled generator never bills the same
--    provider twice for the same period.

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_reference_unique
  ON provider_invoice_payments (payment_reference)
  WHERE payment_reference IS NOT NULL;

ALTER TABLE provider_invoices
  ADD COLUMN IF NOT EXISTS generated_by TEXT;

-- An invoice is a financial record and must state its own currency: a provider
-- can change theirs, and re-deriving it from `providers.currency` at payment
-- time would charge an old invoice at a new currency.
ALTER TABLE provider_invoices
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE provider_invoices i
  SET currency = COALESCE(p.currency, 'ZAR')
  FROM providers p
  WHERE p.id = i.provider_id AND i.currency IS NULL;

ALTER TABLE provider_invoices
  DROP CONSTRAINT IF EXISTS provider_invoices_generated_by_check;

ALTER TABLE provider_invoices
  ADD CONSTRAINT provider_invoices_generated_by_check
  CHECK (generated_by IS NULL OR generated_by IN ('manual', 'admin', 'scheduled'));

COMMENT ON COLUMN provider_invoices.generated_by IS
  'How the invoice was raised: manual (legacy provider-authored), admin (superadmin /generate), scheduled (billing cron).';

-- One invoice per provider, type and billing period for automated runs. Manual
-- and admin invoices are unconstrained so back-dated corrections stay possible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_invoices_scheduled_period_unique
  ON provider_invoices (provider_id, invoice_type, period_start, period_end)
  WHERE generated_by = 'scheduled';

-- 3. Issuing an invoice previously only flipped a status column, so a provider
--    had no way of learning they owed anything until they opened the billing tab.
--
--    Migration 354 replaced the global UNIQUE on notification_templates(key)
--    with partial unique indexes split on tenant_id, so a bare
--    ON CONFLICT (key) raises 42P10. The conflict target must repeat the index
--    predicate, and tenant_id must be stated explicitly for it to match.
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
    'provider_invoice_issued',
    'New Invoice',
    'Invoice {{invoice_number}} for {{total_amount}} is due on {{due_date}}',
    ARRAY['push', 'email']::TEXT[],
    'Invoice {{invoice_number}} - {{total_amount}} due {{due_date}}',
    '<h2>New Invoice</h2><p>A new invoice has been issued to your account.</p><p><strong>Invoice:</strong> {{invoice_number}}</p><p><strong>Period:</strong> {{period_start}} to {{period_end}}</p><p><strong>Amount:</strong> {{total_amount}}</p><p><strong>Due:</strong> {{due_date}}</p><p>You can view, download and pay this invoice in the Billing section of the Beautonomi app.</p>',
    ARRAY['invoice_number', 'total_amount', 'due_date', 'period_start', 'period_end']::TEXT[],
    '/provider/settings/billing',
    true,
    'Sent to a provider when Beautonomi issues them a platform invoice'
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
    'provider_invoice_paid',
    'Invoice Paid',
    'Thanks — invoice {{invoice_number}} for {{total_amount}} is settled',
    ARRAY['push', 'email']::TEXT[],
    'Invoice {{invoice_number}} paid',
    '<h2>Invoice Paid</h2><p>We have received payment for invoice {{invoice_number}}.</p><p><strong>Amount:</strong> {{total_amount}}</p><p><strong>Paid:</strong> {{payment_date}}</p>',
    ARRAY['invoice_number', 'total_amount', 'payment_date']::TEXT[],
    '/provider/settings/billing',
    true,
    'Sent to a provider when a platform invoice is fully settled'
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
