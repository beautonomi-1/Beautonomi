-- Beautonomi Database Migration
-- 244_home_provider_primary_location_rpc.sql
-- RPC to fetch one location per provider (primary first, then first by created_at) for home page distance.
-- Reduces payload and avoids loading all locations when only one per provider is needed.

CREATE OR REPLACE FUNCTION get_provider_primary_location_coords(provider_ids uuid[])
RETURNS TABLE(
  provider_id uuid,
  latitude numeric,
  longitude numeric,
  city text,
  country text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (pl.provider_id)
    pl.provider_id,
    pl.latitude,
    pl.longitude,
    pl.city,
    pl.country
  FROM provider_locations pl
  WHERE pl.provider_id = ANY(provider_ids)
    AND pl.is_active = true
  ORDER BY pl.provider_id, pl.is_primary DESC NULLS LAST, pl.created_at ASC;
$$;

COMMENT ON FUNCTION get_provider_primary_location_coords IS 'Returns one row per provider: primary (or first) active location with coords and city/country for home page distance and display.';
