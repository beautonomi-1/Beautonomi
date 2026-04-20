-- Add optional free-distance band for per-km travel pricing (matches travelFeeEngine.freeRadiusKm).

ALTER TABLE provider_travel_fee_settings
  ADD COLUMN IF NOT EXISTS free_within_km NUMERIC(10, 2)
  CHECK (free_within_km IS NULL OR free_within_km >= 0);

COMMENT ON COLUMN provider_travel_fee_settings.free_within_km IS
  'When pricing_model is per_km: kilometers with no distance charge before per-km applies (see travelFeeEngine; minimum_fee is still additive).';
