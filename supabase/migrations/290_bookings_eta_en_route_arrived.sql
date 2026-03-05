-- Migration 290: Add ETA and provider en-route/arrived tracking to bookings
-- Used by GET /api/bookings/[id]/status, start-journey, arrive, location updates.
-- Aligns with Mapbox ETA (provider location route), travel fee, and at-home flow.

-- Timestamps for status mapping (status API and customer tracking)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_en_route_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_arrived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_location JSONB;

COMMENT ON COLUMN bookings.provider_en_route_at IS 'When provider started journey (at-home). Used for status=provider_en_route and customer ETA UI.';
COMMENT ON COLUMN bookings.provider_arrived_at IS 'When provider marked arrived at customer (at-home). Used for status=provider_arrived.';
COMMENT ON COLUMN bookings.estimated_arrival IS 'Estimated arrival time at customer (at-home). From Mapbox/distance or provider input.';
COMMENT ON COLUMN bookings.provider_location IS 'Latest provider lat/lng during journey. { latitude, longitude } for map and ETA.';
