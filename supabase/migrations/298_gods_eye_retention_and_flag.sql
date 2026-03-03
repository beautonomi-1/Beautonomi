-- Gods Eye: retention purge function and optional feature flag for Live Map tab.

-- 1) Retention: purge old provider_location_events using retention_days from config.
CREATE OR REPLACE FUNCTION purge_old_provider_location_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retention_days INT := 30;
  v_cutoff TIMESTAMPTZ;
  v_deleted INT;
BEGIN
  SELECT (value->>'retention_days_raw_pings')::INT
  INTO v_retention_days
  FROM gods_eye_tracking_config
  WHERE key = 'default'
  LIMIT 1;
  IF v_retention_days IS NULL OR v_retention_days < 1 THEN
    v_retention_days := 30;
  END IF;
  v_cutoff := NOW() - (v_retention_days || ' days')::INTERVAL;
  DELETE FROM provider_location_events WHERE recorded_at < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
COMMENT ON FUNCTION purge_old_provider_location_events IS 'Deletes provider_location_events older than retention_days from config. Run via cron or admin API.';

-- 2) Feature flag: show/hide Live Map tab (superadmin can toggle without redeploy).
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
VALUES (
  'gods_eye_live_map',
  'Gods Eye Live Map',
  'Show Live Map tab in Gods Eye (provider/customer locations, arrival tracking)',
  true,
  'admin'
)
ON CONFLICT (feature_key) DO NOTHING;
