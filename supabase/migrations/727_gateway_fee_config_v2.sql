-- 727: Extend payment_gateway_fee_configs to model real gateway pricing
--
-- The original table (migration 093) only stored percentage/fixed/tiered and
-- a currency. It cannot express:
--   • per-method pricing (card vs. EFT/Capitec vs. international)
--   • fixed-fee waiver below a threshold (Paystack: R1 waived < R10)
--   • VAT on top of the quoted rate (SA = 15%)
--   • a per-fee cap
--   • transfer/payout fees (R3 per Paystack transfer)
--   • whether the quoted rate is VAT-exclusive or VAT-inclusive
--
-- This migration adds those columns and seeds the current Paystack ZA pricing
-- so the config is immediately usable and editable by admins.

-- ─── New columns on payment_gateway_fee_configs ─────────────────────────────

ALTER TABLE public.payment_gateway_fee_configs
  ADD COLUMN IF NOT EXISTS payment_method   TEXT NOT NULL DEFAULT '*',
  ADD COLUMN IF NOT EXISTS region           TEXT NOT NULL DEFAULT 'local'
    CHECK (region IN ('local', 'international', '*')),
  ADD COLUMN IF NOT EXISTS fixed_fee_waiver_below NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vat_rate         NUMERIC(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_is_vat_exclusive BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_fee_amount   NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_scope        TEXT NOT NULL DEFAULT 'transaction'
    CHECK (fee_scope IN ('transaction', 'transfer', 'payout'));

COMMENT ON COLUMN public.payment_gateway_fee_configs.payment_method IS
  'Payment channel: card, capitec_pay, ozow_eft, bank_transfer, * (wildcard default)';
COMMENT ON COLUMN public.payment_gateway_fee_configs.region IS
  'Card region: local, international, * (any). Used to select 2.9% vs 3.1% on Paystack.';
COMMENT ON COLUMN public.payment_gateway_fee_configs.fixed_fee_waiver_below IS
  'Waive the fixed-fee component when transaction_amount < this threshold (Paystack: 10.00).';
COMMENT ON COLUMN public.payment_gateway_fee_configs.vat_rate IS
  'VAT / tax rate added on top of computed fee. 0.15 = 15% SA VAT.';
COMMENT ON COLUMN public.payment_gateway_fee_configs.fee_is_vat_exclusive IS
  'When true, vat_rate is applied on top. When false, the stored percentage already includes VAT.';
COMMENT ON COLUMN public.payment_gateway_fee_configs.max_fee_amount IS
  'Cap: computed fee is min(computed, max_fee_amount). NULL = no cap.';
COMMENT ON COLUMN public.payment_gateway_fee_configs.fee_scope IS
  'transaction = normal charge fee; transfer/payout = payout transfer fee.';

-- Drop and recreate the unique constraint to include the new discriminant columns.
-- The original auto-generated name (migration 093) is
-- `payment_gateway_fee_configs_gateway_name_currency_effective_key`
-- (single underscore before "key"). An earlier revision of this migration tried
-- to drop `..._effective__key` (double underscore) which never matched, leaving
-- the old (gateway_name, currency, effective_from) uniqueness in force and
-- blocking the multi-row seed below. Drop every legacy variant defensively.
ALTER TABLE public.payment_gateway_fee_configs
  DROP CONSTRAINT IF EXISTS payment_gateway_fee_configs_gateway_name_currency_effective_key;
ALTER TABLE public.payment_gateway_fee_configs
  DROP CONSTRAINT IF EXISTS payment_gateway_fee_configs_gateway_name_currency_effective__key;

-- Catch-all: drop any remaining UNIQUE constraint whose column set is exactly
-- (gateway_name, currency, effective_from) regardless of its generated name.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.payment_gateway_fee_configs'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['currency', 'effective_from', 'gateway_name']
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_gateway_fee_configs DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- Recreate the wider constraint idempotently.
ALTER TABLE public.payment_gateway_fee_configs
  DROP CONSTRAINT IF EXISTS payment_gateway_fee_configs_gateway_method_region_scope_eff_key;
ALTER TABLE public.payment_gateway_fee_configs
  ADD CONSTRAINT payment_gateway_fee_configs_gateway_method_region_scope_eff_key
  UNIQUE (gateway_name, currency, payment_method, region, fee_scope, effective_from);

-- ─── Updated calculate_expected_fee() ───────────────────────────────────────
-- Applies: round( (amount * pct + fixed * (amount >= waiver ? 1 : 0)) , cap ) * (1 + vat)
-- All inputs come from config — no literals in code.

CREATE OR REPLACE FUNCTION public.calculate_expected_fee(
  gateway_name_param  TEXT,
  transaction_amount  NUMERIC,
  currency_param      TEXT    DEFAULT 'ZAR',
  payment_method_param TEXT   DEFAULT '*',
  region_param        TEXT    DEFAULT 'local',
  fee_scope_param     TEXT    DEFAULT 'transaction'
)
RETURNS NUMERIC AS $$
DECLARE
  cfg            RECORD;
  base_fee       NUMERIC := 0;
  fixed          NUMERIC := 0;
  computed_fee   NUMERIC := 0;
BEGIN
  -- Best-match lookup: specific method + region first, then wildcard fallbacks.
  SELECT * INTO cfg
  FROM public.payment_gateway_fee_configs
  WHERE gateway_name = gateway_name_param
    AND currency      = currency_param
    AND fee_scope     = fee_scope_param
    AND is_active     = true
    AND (effective_until IS NULL OR effective_until > NOW())
    AND effective_from <= NOW()
    AND (payment_method = payment_method_param OR payment_method = '*')
    AND (region         = region_param         OR region         = '*')
  ORDER BY
    -- Prefer the most specific match
    (CASE WHEN payment_method = payment_method_param THEN 0 ELSE 1 END),
    (CASE WHEN region         = region_param         THEN 0 ELSE 1 END),
    effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Percentage component
  base_fee := transaction_amount * COALESCE(cfg.fee_percentage, 0);

  -- Fixed component (waived when transaction_amount < waiver threshold)
  IF cfg.fixed_fee_waiver_below IS NULL OR transaction_amount >= cfg.fixed_fee_waiver_below THEN
    fixed := COALESCE(cfg.fee_fixed_amount, 0);
  END IF;

  computed_fee := base_fee + fixed;

  -- Apply cap if configured
  IF cfg.max_fee_amount IS NOT NULL THEN
    computed_fee := LEAST(computed_fee, cfg.max_fee_amount);
  END IF;

  -- Apply VAT if the stored rate is VAT-exclusive
  IF cfg.fee_is_vat_exclusive AND cfg.vat_rate > 0 THEN
    computed_fee := computed_fee * (1 + cfg.vat_rate);
  END IF;

  RETURN ROUND(computed_fee, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Seed Paystack ZA pricing ────────────────────────────────────────────────
-- These rows represent the current real Paystack pricing for South Africa.
-- They are editable by superadmins in /admin/fees — this is not frozen config.

-- Seeds are idempotent on the business key (gateway_name, currency, payment_method,
-- region, fee_scope). Because effective_from = NOW() differs on each run, an
-- ON CONFLICT (…, effective_from) clause would never match and would create
-- duplicate rows on re-run. We instead INSERT … SELECT … WHERE NOT EXISTS so a
-- re-run is a true no-op while any active row for that channel already exists.

-- Paystack ZA: local card — 2.9% + R1, VAT-exclusive 15%, R1 waived < R10
INSERT INTO public.payment_gateway_fee_configs
  (gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency,
   payment_method, region, fixed_fee_waiver_below, vat_rate, fee_is_vat_exclusive,
   max_fee_amount, fee_scope, is_active, description, effective_from)
SELECT
  'paystack', 'percentage', 0.029, 1.00, 'ZAR',
  'card', 'local', 10.00, 0.15, true,
  NULL, 'transaction', true,
  'Paystack ZA local card: 2.9% + R1 (VAT excl, 15% VAT on top, R1 waived < R10)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateway_fee_configs
  WHERE gateway_name = 'paystack' AND currency = 'ZAR'
    AND payment_method = 'card' AND region = 'local' AND fee_scope = 'transaction'
);

-- Paystack ZA: international card — 3.1% + R1, VAT-exclusive 15%
INSERT INTO public.payment_gateway_fee_configs
  (gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency,
   payment_method, region, fixed_fee_waiver_below, vat_rate, fee_is_vat_exclusive,
   max_fee_amount, fee_scope, is_active, description, effective_from)
SELECT
  'paystack', 'percentage', 0.031, 1.00, 'ZAR',
  'card', 'international', NULL, 0.15, true,
  NULL, 'transaction', true,
  'Paystack ZA international card: 3.1% + R1 (VAT excl, 15% VAT on top)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateway_fee_configs
  WHERE gateway_name = 'paystack' AND currency = 'ZAR'
    AND payment_method = 'card' AND region = 'international' AND fee_scope = 'transaction'
);

-- Paystack ZA: Capitec Pay — 2% flat, no fixed fee, VAT-exclusive 15%
INSERT INTO public.payment_gateway_fee_configs
  (gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency,
   payment_method, region, fixed_fee_waiver_below, vat_rate, fee_is_vat_exclusive,
   max_fee_amount, fee_scope, is_active, description, effective_from)
SELECT
  'paystack', 'percentage', 0.02, 0.00, 'ZAR',
  'capitec_pay', 'local', NULL, 0.15, true,
  NULL, 'transaction', true,
  'Paystack ZA Capitec Pay / EFT: 2% flat (VAT excl, 15% VAT on top, no fixed fee)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateway_fee_configs
  WHERE gateway_name = 'paystack' AND currency = 'ZAR'
    AND payment_method = 'capitec_pay' AND region = 'local' AND fee_scope = 'transaction'
);

-- Paystack ZA: Ozow EFT — 2% flat, no fixed fee, VAT-exclusive 15%
INSERT INTO public.payment_gateway_fee_configs
  (gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency,
   payment_method, region, fixed_fee_waiver_below, vat_rate, fee_is_vat_exclusive,
   max_fee_amount, fee_scope, is_active, description, effective_from)
SELECT
  'paystack', 'percentage', 0.02, 0.00, 'ZAR',
  'ozow_eft', 'local', NULL, 0.15, true,
  NULL, 'transaction', true,
  'Paystack ZA Ozow EFT: 2% flat (VAT excl, 15% VAT on top, no fixed fee)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateway_fee_configs
  WHERE gateway_name = 'paystack' AND currency = 'ZAR'
    AND payment_method = 'ozow_eft' AND region = 'local' AND fee_scope = 'transaction'
);

-- Paystack ZA: bank transfer (payout) — R3 per transfer, no VAT
INSERT INTO public.payment_gateway_fee_configs
  (gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency,
   payment_method, region, fixed_fee_waiver_below, vat_rate, fee_is_vat_exclusive,
   max_fee_amount, fee_scope, is_active, description, effective_from)
SELECT
  'paystack', 'fixed', 0.00, 3.00, 'ZAR',
  'bank_transfer', '*', NULL, 0.00, false,
  NULL, 'transfer', true,
  'Paystack ZA payout transfer: R3 per transfer (success or fail, no VAT)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateway_fee_configs
  WHERE gateway_name = 'paystack' AND currency = 'ZAR'
    AND payment_method = 'bank_transfer' AND region = '*' AND fee_scope = 'transfer'
);
