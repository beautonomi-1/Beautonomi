-- 849: Apple monthly settlement reconciliation

BEGIN;

CREATE TABLE IF NOT EXISTS public.apple_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  region TEXT NOT NULL DEFAULT 'ZA',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  reported_proceeds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_proceeds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bank_deposit NUMERIC(14, 2),
  fx_rate NUMERIC(18, 8),
  variance NUMERIC(14, 2) GENERATED ALWAYS AS (
    COALESCE(reported_proceeds, 0) - COALESCE(expected_proceeds, 0)
  ) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewed', 'resolved', 'disputed')
  ),
  statement_reference TEXT,
  notes TEXT,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (period_start, period_end, region, currency)
);

CREATE TABLE IF NOT EXISTS public.apple_settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.apple_settlements(id) ON DELETE CASCADE,
  apple_transaction_id TEXT,
  product_id TEXT,
  transaction_type TEXT,
  gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  proceeds_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  finance_transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_settlement_lines_settlement
  ON public.apple_settlement_lines (settlement_id);

ALTER TABLE public.apple_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_settlement_lines ENABLE ROW LEVEL SECURITY;

COMMIT;
