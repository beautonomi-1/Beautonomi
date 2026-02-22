-- Beautonomi Database Migration
-- 020_mapbox_config_and_notifications.sql
-- Adds missing tables referenced by APIs/libs:
-- - mapbox_config (non-secret settings only)
-- - user_devices (OneSignal player/device mapping)
-- - notification_logs (delivery audit)

-- Mapbox config (store public token + style + enabled flags; secrets live in platform_secrets)
CREATE TABLE IF NOT EXISTS mapbox_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_access_token TEXT,
  style_url TEXT,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_mapbox_config_updated_at BEFORE UPDATE ON mapbox_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE mapbox_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage mapbox config"
  ON mapbox_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

CREATE POLICY "Public can view mapbox config"
  ON mapbox_config FOR SELECT
  USING (is_enabled = true);

-- User devices (OneSignal player id mapping)
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  onesignal_player_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(onesignal_player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON user_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own devices"
  ON user_devices FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notification logs (internal audit; service-role writes, superadmin reads)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
  provider_response JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  channels TEXT[] DEFAULT '{push}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view notification logs"
  ON notification_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

