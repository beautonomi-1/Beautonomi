-- ============================================================================
-- Migration 853: Normalize Apple IAP transaction_type for lineage uniqueness
-- ============================================================================
-- Migration 852's unique index only covers
--   transaction_type = 'Auto-Renewable Subscription'.
-- Rows written before the entitlement bridge started deriving type from product
-- kind defaulted a missing Apple `type` to Consumable and sat outside that
-- index. Rewrite those subscription rows so the lineage bind applies.
-- ============================================================================

UPDATE public.apple_iap_transactions
SET
  transaction_type = 'Auto-Renewable Subscription',
  updated_at = now()
WHERE transaction_type IS DISTINCT FROM 'Auto-Renewable Subscription'
  AND (
    product_id LIKE '%.sub.%'
    OR transaction_type ILIKE '%subscription%'
  );
