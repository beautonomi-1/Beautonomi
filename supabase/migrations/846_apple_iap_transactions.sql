-- 846: Apple IAP transaction log

BEGIN;

CREATE TABLE IF NOT EXISTS public.apple_iap_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL UNIQUE,
  original_transaction_id TEXT NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES public.apple_iap_products(product_id),
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'Auto-Renewable Subscription',
      'Non-Consumable',
      'Consumable',
      'Non-Renewing Subscription'
    )
  ),
  purchase_date TIMESTAMPTZ NOT NULL,
  expires_date TIMESTAMPTZ,
  grace_period_expires_date TIMESTAMPTZ,
  revocation_date TIMESTAMPTZ,
  revocation_reason TEXT,
  offer_type TEXT,
  in_app_ownership_type TEXT,
  storefront TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('Production', 'Sandbox')),
  price_zar NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  app_account_token UUID,
  ads_budget_order_id UUID REFERENCES public.ads_budget_orders(id) ON DELETE SET NULL,
  notification_uuid TEXT,
  raw_jws TEXT,
  attribution_status TEXT NOT NULL DEFAULT 'bound' CHECK (
    attribution_status IN ('bound', 'pending', 'failed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_iap_tx_provider ON public.apple_iap_transactions (provider_id);
CREATE INDEX IF NOT EXISTS idx_apple_iap_tx_original ON public.apple_iap_transactions (original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_apple_iap_tx_product ON public.apple_iap_transactions (product_id);
CREATE INDEX IF NOT EXISTS idx_apple_iap_tx_pending ON public.apple_iap_transactions (attribution_status)
  WHERE attribution_status = 'pending';

-- One provider per Apple subscription lineage (prevents sharing across businesses)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_apple_iap_original_provider
  ON public.apple_iap_transactions (original_transaction_id, provider_id)
  WHERE provider_id IS NOT NULL AND transaction_type = 'Auto-Renewable Subscription';

ALTER TABLE public.apple_iap_transactions ENABLE ROW LEVEL SECURITY;

COMMIT;
