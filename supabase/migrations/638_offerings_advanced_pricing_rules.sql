-- 638_offerings_advanced_pricing_rules.sql
-- Provider catalogue advanced pricing (time / client / seasonal rules) stored on offerings.
-- Required by POST/PATCH /api/provider/services — without this column updates return 500.

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS advanced_pricing_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.offerings.advanced_pricing_rules IS
  'JSON array of advanced pricing rules (time_based, client_type, seasonal, etc.) applied on top of base price.';

CREATE INDEX IF NOT EXISTS idx_offerings_advanced_pricing_rules
  ON public.offerings USING GIN (advanced_pricing_rules);
