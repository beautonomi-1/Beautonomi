-- Allow Flutterwave as online checkout provider (parity with Paystack / Stripe).
ALTER TABLE public.online_payment_checkouts
  DROP CONSTRAINT IF EXISTS online_payment_checkouts_provider_check;

ALTER TABLE public.online_payment_checkouts
  ADD CONSTRAINT online_payment_checkouts_provider_check
  CHECK (provider IN ('paystack', 'stripe', 'flutterwave'));
