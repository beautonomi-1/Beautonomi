-- Unify the feature_flags.category value for all payment-related flags.
-- Migration 092 seeded payment_stripe and payment_wallet with category='payment' (singular),
-- while later migrations (622, 648, 611) used category='payments' (plural).
-- The admin SPA groups and applies the effective-preview column only for category='payments',
-- so the early payment flags were siloed into a separate "payment" group with no preview.
-- This idempotent UPDATE consolidates them under 'payments'.

UPDATE public.feature_flags
SET
  category   = 'payments',
  updated_at = NOW()
WHERE category = 'payment';
