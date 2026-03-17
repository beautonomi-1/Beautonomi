-- Per-provider on-demand accept: when true, customers see "Request now" for this provider.
ALTER TABLE provider_online_booking_settings
ADD COLUMN IF NOT EXISTS on_demand_accept_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN provider_online_booking_settings.on_demand_accept_enabled IS
  'When true (and global on-demand flags are on), customers can submit on-demand requests for this provider.';
