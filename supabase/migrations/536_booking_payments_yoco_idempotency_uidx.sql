-- Prevent duplicate Yoco terminal booking payments when provider app and webhook
-- retries race with the same terminal payment reference.
CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_yoco_provider_reference_uidx
  ON public.booking_payments (payment_provider, payment_provider_id)
  WHERE payment_provider = 'yoco'
    AND payment_provider_id IS NOT NULL
    AND btrim(payment_provider_id) <> '';
