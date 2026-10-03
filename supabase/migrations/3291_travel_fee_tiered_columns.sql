-- Migration: Add tiered travel fee support to provider_travel_fee_settings
-- 329_travel_fee_tiered_columns.sql
-- Adds pricing_model and tiers columns; NULL means follow platform / per-km behaviour.

ALTER TABLE provider_travel_fee_settings
  ADD COLUMN IF NOT EXISTS pricing_model TEXT CHECK (pricing_model IN ('per_km', 'tiered'));

ALTER TABLE provider_travel_fee_settings
  ADD COLUMN IF NOT EXISTS tiers JSONB DEFAULT NULL;

COMMENT ON COLUMN provider_travel_fee_settings.pricing_model IS 'per_km = rate per km + min/max; tiered = fixed fee per distance band. NULL = use platform default.';
COMMENT ON COLUMN provider_travel_fee_settings.tiers IS 'When pricing_model = tiered: array of { max_km: number, fee: number }. E.g. [{ "max_km": 10, "fee": 100 }, { "max_km": 50, "fee": 150 }].';
