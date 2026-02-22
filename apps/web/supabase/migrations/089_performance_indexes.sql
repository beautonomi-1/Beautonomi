-- Performance optimization indexes for public pages
-- These indexes speed up common queries on public-facing pages

-- Index for provider_locations city/country lookups (used in browse by city and search)
CREATE INDEX IF NOT EXISTS idx_provider_locations_city_country 
  ON provider_locations(city, country, is_active) 
  WHERE is_active = true;

-- Index for provider_locations city lookups (case-insensitive search)
CREATE INDEX IF NOT EXISTS idx_provider_locations_city_active 
  ON provider_locations(lower(city), is_active) 
  WHERE is_active = true;

-- Index for provider_locations country lookups
CREATE INDEX IF NOT EXISTS idx_provider_locations_country_active 
  ON provider_locations(lower(country), is_active) 
  WHERE is_active = true;

-- Composite index for providers status + rating (used in top rated queries)
CREATE INDEX IF NOT EXISTS idx_providers_status_rating_reviews 
  ON providers(status, rating_average DESC, review_count DESC) 
  WHERE status = 'active';

-- Index for providers created_at (used in upcoming talent and newest providers)
CREATE INDEX IF NOT EXISTS idx_providers_created_at_status 
  ON providers(created_at DESC, status) 
  WHERE status = 'active';

-- Index for offerings price lookups (used in starting_price calculations)
CREATE INDEX IF NOT EXISTS idx_offerings_provider_price_active 
  ON offerings(provider_id, price, is_active) 
  WHERE is_active = true;

-- Index for bookings provider_id and created_at (used in hottest picks)
CREATE INDEX IF NOT EXISTS idx_bookings_provider_created_status 
  ON bookings(provider_id, created_at DESC, status) 
  WHERE status IN ('confirmed', 'completed', 'in_progress');

-- Index for provider_locations with coordinates (used in nearest providers)
CREATE INDEX IF NOT EXISTS idx_provider_locations_coords_active 
  ON provider_locations(latitude, longitude, is_active) 
  WHERE is_active = true AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for providers business_name (used in search)
CREATE INDEX IF NOT EXISTS idx_providers_business_name_status 
  ON providers(lower(business_name), status) 
  WHERE status = 'active';

-- Index for provider_global_category_associations (used in category filtering)
CREATE INDEX IF NOT EXISTS idx_provider_category_associations 
  ON provider_global_category_associations(global_category_id, provider_id);

-- Index for reviews provider_id and rating (if reviews table exists and is used)
-- Note: Adjust table name if different
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    CREATE INDEX IF NOT EXISTS idx_reviews_provider_rating 
      ON reviews(provider_id, rating DESC);
  END IF;
END $$;
