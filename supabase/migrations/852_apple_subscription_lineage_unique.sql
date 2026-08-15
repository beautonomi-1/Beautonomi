-- ============================================================================
-- Migration 852: One Apple subscription lineage → one Beautonomi business
-- ============================================================================
-- Renewals mint a new transaction_id. Binding only that id let a restore on a
-- second account attach the same Apple subscription to two providers. The
-- original_transaction_id is the stable lineage key Apple uses for the life
-- of the subscription.
-- ============================================================================

DROP INDEX IF EXISTS public.uniq_apple_iap_original_provider;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_apple_iap_original_subscription
  ON public.apple_iap_transactions (original_transaction_id)
  WHERE provider_id IS NOT NULL
    AND transaction_type = 'Auto-Renewable Subscription';

DROP INDEX IF EXISTS public.idx_provider_subs_apple_original;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_subs_apple_original
  ON public.provider_subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;
