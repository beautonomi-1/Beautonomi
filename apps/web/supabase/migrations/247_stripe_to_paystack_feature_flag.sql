-- Replace Stripe payment feature flag with Paystack (platform uses Paystack)
UPDATE feature_flags
SET
  feature_key = 'payment_paystack',
  feature_name = 'Paystack Payments',
  description = 'Enable Paystack payment processing'
WHERE feature_key = 'payment_stripe';
