-- Beautonomi Database Migration
-- 091_staff_time_tracking_indexes.sql
-- Additional performance indexes for staff time tracking queries

-- Indexes for time card queries by date range
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_date_range 
    ON staff_time_cards(provider_id, date DESC, clock_in_time DESC);

-- Index for finding active clock-ins (clocked in but not out)
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_active_clock_in 
    ON staff_time_cards(staff_id, date) 
    WHERE clock_out_time IS NULL;

-- Index for time card totals calculations
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_totals 
    ON staff_time_cards(staff_id, date, total_hours) 
    WHERE total_hours IS NOT NULL;

-- Index for days off queries by date range
CREATE INDEX IF NOT EXISTS idx_staff_days_off_date_range 
    ON staff_days_off(provider_id, date DESC);

-- Index for upcoming days off (date filtering done in queries, not in index predicate)
CREATE INDEX IF NOT EXISTS idx_staff_days_off_upcoming 
    ON staff_days_off(staff_id, date DESC) 
    WHERE date IS NOT NULL;

-- Index for provider_staff time clock queries
CREATE INDEX IF NOT EXISTS idx_provider_staff_time_clock 
    ON provider_staff(provider_id, time_clock_enabled, is_active) 
    WHERE time_clock_enabled = true AND is_active = true;

-- Index for provider_staff PIN lookups (for front desk clock in)
CREATE INDEX IF NOT EXISTS idx_provider_staff_time_clock_pin 
    ON provider_staff(provider_id, time_clock_pin) 
    WHERE time_clock_pin IS NOT NULL AND time_clock_enabled = true;
