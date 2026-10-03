-- Add app_type to user_devices for multi-app OneSignal (customer vs provider).
-- Nullable for backward compatibility: NULL treated as 'customer' when querying.
ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS app_type TEXT CHECK (app_type IS NULL OR app_type IN ('customer', 'provider'));

CREATE INDEX IF NOT EXISTS idx_user_devices_user_app_type ON user_devices(user_id, app_type);

COMMENT ON COLUMN user_devices.app_type IS 'OneSignal app: customer or provider. NULL = legacy single-app (treated as customer).';
