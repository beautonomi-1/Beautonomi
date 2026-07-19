-- Migration 797: PayCloud payment notify_url column
--
-- The payment initiation insert (apps/web/src/app/api/provider/paycloud/payments/route.ts)
-- and the reconcile/webhook flows persist the webhook notify URL supplied to PayCloud,
-- but no `notify_url` column existed on provider_paycloud_payments. Because the insert
-- is cast to `any`, TypeScript did not catch it, and every cloud + same-terminal PayCloud
-- charge insert would fail at runtime with PostgREST "could not find the 'notify_url'
-- column" (PGRST204). This adds the column (nullable, additive — safe on existing rows).

ALTER TABLE public.provider_paycloud_payments
  ADD COLUMN IF NOT EXISTS notify_url TEXT;

COMMENT ON COLUMN public.provider_paycloud_payments.notify_url IS
  'Webhook notify URL supplied to PayCloud for this charge (audit trail).';
