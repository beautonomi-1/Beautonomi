-- Migration 201: Add Performance Indexes
-- Description: Add database indexes to improve query performance across the provider portal

-- ============================================================================
-- BOOKINGS INDEXES
-- ============================================================================

-- Index for provider dashboard and appointment lists (filtered by provider and status)
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status 
  ON bookings(provider_id, status) 
  WHERE status IS NOT NULL;

-- Index for calendar queries (scheduled appointments)
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at 
  ON bookings(scheduled_at) 
  WHERE scheduled_at IS NOT NULL;

-- Index for customer booking history
CREATE INDEX IF NOT EXISTS idx_bookings_customer_created 
  ON bookings(customer_id, created_at DESC);

-- Index for booking number lookups
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number 
  ON bookings(booking_number) 
  WHERE booking_number IS NOT NULL;

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status 
  ON bookings(provider_id, payment_status) 
  WHERE payment_status IS NOT NULL;

-- ============================================================================
-- LOYALTY TRANSACTIONS INDEXES
-- ============================================================================

-- Index for customer loyalty points history
CREATE INDEX IF NOT EXISTS idx_loyalty_user_created 
  ON loyalty_point_transactions(user_id, created_at DESC);

-- Index for booking-related loyalty transactions (for reversal lookups)
CREATE INDEX IF NOT EXISTS idx_loyalty_reference 
  ON loyalty_point_transactions(reference_id, reference_type, transaction_type);

-- Index for transaction type queries
CREATE INDEX IF NOT EXISTS idx_loyalty_transaction_type 
  ON loyalty_point_transactions(transaction_type, created_at DESC);

-- ============================================================================
-- BOOKING SERVICES INDEXES
-- ============================================================================

-- Index for booking services by booking (for detail views)
CREATE INDEX IF NOT EXISTS idx_booking_services_booking 
  ON booking_services(booking_id, staff_id);

-- Index for staff member schedules
CREATE INDEX IF NOT EXISTS idx_booking_services_staff 
  ON booking_services(staff_id, scheduled_start_at) 
  WHERE scheduled_start_at IS NOT NULL;

-- ============================================================================
-- BOOKING PRODUCTS INDEXES
-- ============================================================================

-- Index for booking products by booking
CREATE INDEX IF NOT EXISTS idx_booking_products_booking 
  ON booking_products(booking_id, product_id);

-- Index for product sales reports
CREATE INDEX IF NOT EXISTS idx_booking_products_product 
  ON booking_products(product_id, created_at DESC);

-- ============================================================================
-- PRODUCTS INDEXES
-- ============================================================================

-- Index for active products in provider catalog
CREATE INDEX IF NOT EXISTS idx_products_provider_active 
  ON products(provider_id, is_active, retail_sales_enabled) 
  WHERE is_active = true;

-- Index for low stock alerts
CREATE INDEX IF NOT EXISTS idx_products_low_stock 
  ON products(provider_id, quantity, low_stock_level) 
  WHERE track_stock_quantity = true AND is_active = true;

-- Index for product search by SKU
CREATE INDEX IF NOT EXISTS idx_products_sku 
  ON products(sku) 
  WHERE sku IS NOT NULL;

-- Index for product search by barcode
CREATE INDEX IF NOT EXISTS idx_products_barcode 
  ON products(barcode) 
  WHERE barcode IS NOT NULL;

-- ============================================================================
-- PROVIDER STAFF INDEXES
-- ============================================================================

-- Index for active staff members
CREATE INDEX IF NOT EXISTS idx_provider_staff_provider 
  ON provider_staff(provider_id, is_active) 
  WHERE is_active = true;

-- Index for staff member lookups by user
CREATE INDEX IF NOT EXISTS idx_provider_staff_user 
  ON provider_staff(user_id) 
  WHERE user_id IS NOT NULL;

-- ============================================================================
-- USERS INDEXES
-- ============================================================================

-- Index for user role queries
CREATE INDEX IF NOT EXISTS idx_users_role 
  ON users(role) 
  WHERE role IS NOT NULL;

-- Index for email lookups (if not already exists)
CREATE INDEX IF NOT EXISTS idx_users_email 
  ON users(email) 
  WHERE email IS NOT NULL;

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_users_phone 
  ON users(phone) 
  WHERE phone IS NOT NULL;

-- ============================================================================
-- PROVIDERS INDEXES
-- ============================================================================

-- Index for VAT registered providers
CREATE INDEX IF NOT EXISTS idx_providers_vat 
  ON providers(is_vat_registered, tax_rate_percent) 
  WHERE is_vat_registered = true;

-- Index for providers by creation date (removed is_active as column doesn't exist)
CREATE INDEX IF NOT EXISTS idx_providers_created 
  ON providers(created_at DESC);

-- ============================================================================
-- OFFERINGS (SERVICES) INDEXES
-- ============================================================================

-- Index for provider services
CREATE INDEX IF NOT EXISTS idx_offerings_provider 
  ON offerings(provider_id, is_active) 
  WHERE is_active = true;

-- Index for service category queries
CREATE INDEX IF NOT EXISTS idx_offerings_category 
  ON offerings(category_id, is_active) 
  WHERE category_id IS NOT NULL AND is_active = true;

-- ============================================================================
-- PROVIDER LOCATIONS INDEXES
-- ============================================================================

-- Index for provider locations
CREATE INDEX IF NOT EXISTS idx_provider_locations_provider 
  ON provider_locations(provider_id, is_active) 
  WHERE is_active = true;

-- ============================================================================
-- BOOKING EVENTS INDEXES (for audit log)
-- ============================================================================

-- Index for booking event history
CREATE INDEX IF NOT EXISTS idx_booking_events_booking 
  ON booking_events(booking_id, created_at DESC);

-- Index for event type queries
CREATE INDEX IF NOT EXISTS idx_booking_events_type 
  ON booking_events(event_type, created_at DESC);

-- ============================================================================
-- PROVIDER GAMIFICATION INDEXES (if table exists)
-- ============================================================================

-- Index for provider points balance
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_point_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_provider_points_provider 
      ON provider_point_transactions(provider_id, created_at DESC);
  END IF;
END $$;

-- ============================================================================
-- NOTIFICATIONS INDEXES (if table exists)
-- ============================================================================

-- Index for user notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user 
      ON notifications(user_id, created_at DESC, is_read);
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_bookings_provider_status IS 'Improves provider dashboard and appointment list queries';
COMMENT ON INDEX idx_bookings_scheduled_at IS 'Improves calendar queries for scheduled appointments';
COMMENT ON INDEX idx_loyalty_user_created IS 'Improves customer loyalty points history queries';
COMMENT ON INDEX idx_loyalty_reference IS 'Improves loyalty reversal lookups for bookings';
COMMENT ON INDEX idx_products_provider_active IS 'Improves product catalog queries';
COMMENT ON INDEX idx_provider_staff_provider IS 'Improves staff member queries';

-- ============================================================================
-- ANALYZE TABLES (update statistics for query planner)
-- ============================================================================

ANALYZE bookings;
ANALYZE loyalty_point_transactions;
ANALYZE booking_services;
ANALYZE booking_products;
ANALYZE products;
ANALYZE provider_staff;
ANALYZE users;
ANALYZE providers;
ANALYZE offerings;
ANALYZE provider_locations;
