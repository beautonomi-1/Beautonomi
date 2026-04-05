-- Enforce one booking_payments row per Paystack transaction id (webhook idempotency, spec §3.3).
-- Apply after removing any duplicate (payment_provider, payment_provider_id) pairs for paystack.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT payment_provider, payment_provider_id, COUNT(*) AS c
      FROM public.booking_payments
      WHERE payment_provider = 'paystack'
        AND payment_provider_id IS NOT NULL
        AND btrim(payment_provider_id) <> ''
      GROUP BY payment_provider, payment_provider_id
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'booking_payments: duplicate Paystack rows for same payment_provider_id; dedupe before migration 380';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_paystack_provider_tx_uidx
  ON public.booking_payments (payment_provider, payment_provider_id)
  WHERE payment_provider = 'paystack'
    AND payment_provider_id IS NOT NULL
    AND btrim(payment_provider_id) <> '';

COMMENT ON INDEX public.booking_payments_paystack_provider_tx_uidx IS
  'Idempotent Paystack webhooks: one row per gateway transaction id (INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC §3.3).';
