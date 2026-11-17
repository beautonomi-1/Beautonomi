-- Flutterwave provider subscriptions write billing_provider = 'flutterwave'
-- (activation, renewal, and the 3-day past_due grace). The enum only had
-- paystack, apple, manual, and stripe, so those writes were rejected and the
-- Flutterwave renewal job never saw a row.
-- New enum values cannot be used in this same migration (PostgreSQL 55P04).

ALTER TYPE public.billing_provider_enum ADD VALUE IF NOT EXISTS 'flutterwave';
