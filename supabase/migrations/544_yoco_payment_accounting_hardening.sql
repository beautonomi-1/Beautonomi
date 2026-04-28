-- Make Yoco payment reconciliation idempotent at the Yoco transaction layer.
CREATE UNIQUE INDEX IF NOT EXISTS provider_yoco_payments_yoco_payment_id_uidx
  ON public.provider_yoco_payments (yoco_payment_id)
  WHERE yoco_payment_id IS NOT NULL
    AND btrim(yoco_payment_id) <> '';

COMMENT ON INDEX public.provider_yoco_payments_yoco_payment_id_uidx IS
  'Prevents duplicate local Yoco payment rows for the same Yoco payment id.';
