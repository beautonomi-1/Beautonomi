-- Idempotent repair for user_devices composite unique (630).
-- Run verification first if unsure:
--   SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
--   WHERE t.relname = 'user_devices' AND c.contype = 'u';
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_devices';
-- Expected: user_devices_player_app_type_key UNIQUE (onesignal_player_id, app_type)

-- Normalize legacy rows (NULL app_type treated as customer elsewhere in code).
UPDATE user_devices SET app_type = 'customer' WHERE app_type IS NULL;

-- Dedupe: keep newest last_seen per (onesignal_player_id, app_type).
DELETE FROM user_devices d
USING user_devices keep
WHERE d.onesignal_player_id = keep.onesignal_player_id
  AND d.app_type = keep.app_type
  AND d.id <> (
    SELECT id FROM user_devices k
    WHERE k.onesignal_player_id = d.onesignal_player_id
      AND k.app_type = d.app_type
    ORDER BY k.last_seen DESC NULLS LAST, k.created_at DESC
    LIMIT 1
  );

-- Remove old single-column unique (constraint or index).
ALTER TABLE user_devices DROP CONSTRAINT IF EXISTS user_devices_onesignal_player_id_key;
DROP INDEX IF EXISTS user_devices_onesignal_player_id_key;

-- Ensure composite unique exists.
ALTER TABLE user_devices DROP CONSTRAINT IF EXISTS user_devices_player_app_type_key;
ALTER TABLE user_devices
  ADD CONSTRAINT user_devices_player_app_type_key
  UNIQUE (onesignal_player_id, app_type);

NOTIFY pgrst, 'reload schema';
