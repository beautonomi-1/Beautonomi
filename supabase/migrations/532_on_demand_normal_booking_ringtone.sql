-- Optional ringtone for standard (non–on-demand) booking alerts on provider apps / web.
-- Same app-assets bucket as on-demand; signed URL via /api/public/on-demand/ringtone-url?scope=normal_booking

ALTER TABLE on_demand_module_config
  ADD COLUMN IF NOT EXISTS normal_booking_ringtone_asset_path TEXT,
  ADD COLUMN IF NOT EXISTS normal_booking_ring_duration_seconds INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS normal_booking_ring_repeat BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN on_demand_module_config.normal_booking_ringtone_asset_path IS
  'Storage path in app-assets (e.g. ux/ringtones/booking.mp3). When set, provider normal-booking realtime alerts play this file; otherwise vibration-only (mobile).';
