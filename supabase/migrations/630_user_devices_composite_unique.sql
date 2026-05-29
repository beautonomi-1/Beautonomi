-- Replace single-column unique with composite (onesignal_player_id, app_type)
-- so each app type can register the same device independently.
ALTER TABLE user_devices
  DROP CONSTRAINT IF EXISTS user_devices_onesignal_player_id_key;

ALTER TABLE user_devices
  ADD CONSTRAINT user_devices_player_app_type_key
  UNIQUE (onesignal_player_id, app_type);
