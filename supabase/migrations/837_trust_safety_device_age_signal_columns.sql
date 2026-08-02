-- Extend users table for full device age signal payload (age-signal API).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS device_age_upper_bound INTEGER,
  ADD COLUMN IF NOT EXISTS device_age_signal_source TEXT;

COMMENT ON COLUMN public.users.device_age_upper_bound IS
  'Upper bound of device-reported age range (Play/App Store age signals).';
COMMENT ON COLUMN public.users.device_age_signal_source IS
  'Source of device age signal: client, ios_declared_age_range, play_age_signals, etc.';
