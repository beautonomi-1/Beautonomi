-- Rollout operations metadata for city-by-city / phased launches (admin control plane).

ALTER TABLE platform_zones
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN platform_zones.published_at IS 'First time the zone was published (status became active).';
COMMENT ON COLUMN platform_zones.ops_metadata IS 'JSON: rolloutMode, runbookNotes, targetLaunchAt, internalCodename, clonedFromZoneId, etc.';
