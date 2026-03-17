-- One-time migration: copy provider_yoco_terminals (legacy) into provider_yoco_integrations + provider_yoco_devices
-- so providers who added "terminals" on the old web page see them as devices. Does not delete from terminals (safe rollback).
-- Safe to run multiple times: integration insert uses ON CONFLICT DO NOTHING; device insert uses ON CONFLICT DO NOTHING.
-- See: full Yoco alignment plan (one model = devices).

-- 1) Create integration from first terminal per provider (where no integration exists)
INSERT INTO provider_yoco_integrations (provider_id, secret_key, public_key, is_enabled, connected_date, created_at, updated_at)
SELECT DISTINCT ON (t.provider_id)
  t.provider_id,
  t.secret_key,
  t.api_key,  -- terminals had api_key; store as public_key for compatibility
  (t.secret_key IS NOT NULL AND t.secret_key != ''),
  NOW(),
  NOW(),
  NOW()
FROM provider_yoco_terminals t
WHERE NOT EXISTS (
  SELECT 1 FROM provider_yoco_integrations i WHERE i.provider_id = t.provider_id
)
ORDER BY t.provider_id, t.created_at ASC
ON CONFLICT (provider_id) DO NOTHING;

-- 2) Create device row per terminal (skip if device already exists for same provider + yoco_device_id)
INSERT INTO provider_yoco_devices (provider_id, name, yoco_device_id, location_id, location_name, is_active, created_at, updated_at)
SELECT
  t.provider_id,
  t.device_name,
  t.device_id,
  NULL,
  t.location_name,
  COALESCE(t.active, true),
  t.created_at,
  COALESCE(t.updated_at, t.created_at)
FROM provider_yoco_terminals t
ON CONFLICT (provider_id, yoco_device_id) DO NOTHING;

COMMENT ON TABLE provider_yoco_terminals IS 'Legacy table for Yoco terminals. Migrated to provider_yoco_integrations + provider_yoco_devices (migration 321). Prefer devices API and Yoco Integration/Devices UI.';
