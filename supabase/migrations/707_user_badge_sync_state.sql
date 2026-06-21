-- Tracks last badge count pushed via badge_sync so mark-read storms don't spam OneSignal.
CREATE TABLE IF NOT EXISTS user_badge_sync_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_type TEXT NOT NULL CHECK (app_type IN ('customer', 'provider')),
  last_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_type)
);

CREATE INDEX IF NOT EXISTS idx_user_badge_sync_state_updated
  ON user_badge_sync_state (updated_at DESC);

COMMENT ON TABLE user_badge_sync_state IS
  'Last OS badge count successfully pushed via silent badge_sync (dedupe guard).';

ALTER TABLE user_badge_sync_state ENABLE ROW LEVEL SECURITY;
-- No policies: server writes via service role only.
