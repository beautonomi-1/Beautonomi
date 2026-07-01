-- Seed the master gate for Paystack online payments.
--
-- Runtime code (getPaymentFeatureFlagsForTenant → checkMultipleFeaturesServer) reads
-- `payment_paystack` to gate booking-hold checkout and gift-card purchases. That resolver
-- returns FALSE for any feature_key with no matching row, so without this seed Paystack
-- silently disables on any environment that never had the row created manually.
--
-- The legacy `payment_stripe` row (migration 092) is NOT read anywhere in application code
-- (Stripe is not the payment processor — Paystack is), so it is intentionally left inert.
--
-- Idempotent: only inserts the global row when it does not already exist.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_paystack',
    'Paystack Payments',
    'Enable Paystack online payment processing for booking checkout and gift-card purchases. Disable to hide Paystack as a payment method.',
    true,
    'payments'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'payment_paystack'
      AND tenant_id IS NULL
);
