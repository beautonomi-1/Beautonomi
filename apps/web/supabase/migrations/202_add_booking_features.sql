-- Migration 202: Add Booking Features (Travel Settings, Buffer Time, Staff Schedules)
-- Created: 2026-02-11
-- Purpose: Add all missing features for complete booking system

-- ============================================================================
-- 1. Add Travel Settings to Providers
-- ============================================================================

-- Add travel_settings JSONB column to providers table
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS travel_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN providers.travel_settings IS 'Travel fee configuration: strategy, zones, tiers, rates';

-- Example travel_settings structure:
-- {
--   "strategy": "tiered",
--   "zones": [],
--   "tiers": [
--     {"maxDistanceKm": 5, "fee": 0, "minutesPerKm": 2},
--     {"maxDistanceKm": 10, "fee": 50, "minutesPerKm": 2},
--     {"maxDistanceKm": 20, "fee": 100, "minutesPerKm": 2.5}
--   ],
--   "maxRadiusKm": 50,
--   "freeRadiusKm": 5,
--   "baseTravelTimeMinutes": 15,
--   "defaultMinutesPerKm": 2
-- }

-- ============================================================================
-- 2. Add Buffer Time Settings to Providers
-- ============================================================================

-- Add buffer time columns to providers table
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS booking_buffer_before INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS booking_buffer_after INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cleanup_time_minutes INTEGER DEFAULT 0;

COMMENT ON COLUMN providers.booking_buffer_before IS 'Minutes to buffer before appointment (prep time)';
COMMENT ON COLUMN providers.booking_buffer_after IS 'Minutes to buffer after appointment (cleanup time)';
COMMENT ON COLUMN providers.cleanup_time_minutes IS 'Extra minutes between appointments for transition';

-- Add check constraints
ALTER TABLE providers 
ADD CONSTRAINT booking_buffer_before_non_negative CHECK (booking_buffer_before >= 0),
ADD CONSTRAINT booking_buffer_after_non_negative CHECK (booking_buffer_after >= 0),
ADD CONSTRAINT cleanup_time_non_negative CHECK (cleanup_time_minutes >= 0);

-- ============================================================================
-- 3. Create Staff Schedules Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_working BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure day_of_week is 0-6
  CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
  
  -- Ensure start_time < end_time
  CONSTRAINT valid_time_range CHECK (start_time < end_time),
  
  -- One schedule per staff per day
  UNIQUE(staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff ON staff_schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_provider ON staff_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_day ON staff_schedules(day_of_week);

COMMENT ON TABLE staff_schedules IS 'Weekly working hours for staff members';

-- ============================================================================
-- 4. Create Staff Time Off Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  type TEXT DEFAULT 'vacation', -- 'vacation', 'sick', 'holiday', 'personal'
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'denied'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure start_date <= end_date
  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff ON staff_time_off(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_provider ON staff_time_off(provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_dates ON staff_time_off(start_date, end_date);

COMMENT ON TABLE staff_time_off IS 'Staff time off, holidays, and unavailability';

-- ============================================================================
-- 5. Create Staff Services Junction Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_services (
  staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  PRIMARY KEY (staff_id, offering_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_services_staff ON staff_services(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_offering ON staff_services(offering_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_provider ON staff_services(provider_id);

COMMENT ON TABLE staff_services IS 'Which services each staff member can provide';

-- ============================================================================
-- 6. Create Time Blocks Table (if not exists)
-- ============================================================================

-- Create time_blocks table (always include location_id column)
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES provider_staff(id) ON DELETE CASCADE,
  location_id UUID, -- Add column, foreign key added separately if table exists
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'break',
  title TEXT,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_block_time_range CHECK (start_time < end_time)
);

-- Add missing columns if table exists but columns don't
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'time_blocks') THEN
    -- Add location_id if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'location_id'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN location_id UUID;
    END IF;
    
    -- Add block_type if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'block_type'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN block_type TEXT NOT NULL DEFAULT 'break';
    END IF;
    
    -- Add other columns if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'title'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN title TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'notes'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN notes TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'is_recurring'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN is_recurring BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'time_blocks' 
      AND column_name = 'recurrence_rule'
    ) THEN
      ALTER TABLE time_blocks ADD COLUMN recurrence_rule TEXT;
    END IF;
  END IF;
END $$;

-- Add foreign key constraint only if provider_locations exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'provider_locations'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_locations' 
      AND column_name = 'id'
    )
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'time_blocks_location_id_fkey'
      AND table_name = 'time_blocks'
    ) THEN
      ALTER TABLE time_blocks 
      ADD CONSTRAINT time_blocks_location_id_fkey 
      FOREIGN KEY (location_id) REFERENCES provider_locations(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Create indexes only if columns exist
DO $$ 
BEGIN
  -- Provider index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'provider_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_time_blocks_provider ON time_blocks(provider_id);
  END IF;
  
  -- Staff index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_time_blocks_staff ON time_blocks(staff_id);
  END IF;
  
  -- Location index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'location_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_time_blocks_location ON time_blocks(location_id) WHERE location_id IS NOT NULL;
  END IF;
  
  -- Times index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'start_time'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'end_time'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_time_blocks_times ON time_blocks(start_time, end_time);
  END IF;
  
  -- Block type index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_blocks' 
    AND column_name = 'block_type'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_time_blocks_type ON time_blocks(block_type);
  END IF;
END $$;

COMMENT ON TABLE time_blocks IS 'Blocked time on calendar (breaks, meetings, holidays)';

-- ============================================================================
-- 7. Add Offering Locations Junction Table
-- ============================================================================

-- Only create if provider_locations table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_locations') THEN
    CREATE TABLE IF NOT EXISTS offering_locations (
      offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
      provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (offering_id, location_id)
    );

    CREATE INDEX IF NOT EXISTS idx_offering_locations_offering ON offering_locations(offering_id);
    CREATE INDEX IF NOT EXISTS idx_offering_locations_location ON offering_locations(location_id);
    CREATE INDEX IF NOT EXISTS idx_offering_locations_provider ON offering_locations(provider_id);

    COMMENT ON TABLE offering_locations IS 'Which services are available at which locations';
  END IF;
END $$;

-- ============================================================================
-- 8. Add is_bookable Column to Offerings
-- ============================================================================

ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN DEFAULT true;

COMMENT ON COLUMN offerings.is_bookable IS 'Whether this service can be booked online';

-- ============================================================================
-- 9. Create Helper Functions
-- ============================================================================

-- Function to check if staff is available at a given time
CREATE OR REPLACE FUNCTION is_staff_available(
  p_staff_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME
) RETURNS BOOLEAN AS $$
DECLARE
  v_day_of_week INTEGER;
  v_is_working BOOLEAN;
  v_working_start TIME;
  v_working_end TIME;
  v_has_time_off BOOLEAN;
BEGIN
  -- Get day of week (0 = Sunday)
  v_day_of_week := EXTRACT(DOW FROM p_date);
  
  -- Check staff schedule for this day
  SELECT is_working, start_time, end_time
  INTO v_is_working, v_working_start, v_working_end
  FROM staff_schedules
  WHERE staff_id = p_staff_id AND day_of_week = v_day_of_week;
  
  -- Not working this day
  IF NOT FOUND OR NOT v_is_working THEN
    RETURN false;
  END IF;
  
  -- Check if time is within working hours
  IF p_start_time < v_working_start OR p_end_time > v_working_end THEN
    RETURN false;
  END IF;
  
  -- Check if staff has time off on this date
  SELECT EXISTS(
    SELECT 1 FROM staff_time_off
    WHERE staff_id = p_staff_id
      AND p_date >= start_date
      AND p_date <= end_date
      AND status = 'approved'
  ) INTO v_has_time_off;
  
  IF v_has_time_off THEN
    RETURN false;
  END IF;
  
  -- Check if there's a time block
  SELECT EXISTS(
    SELECT 1 FROM time_blocks
    WHERE staff_id = p_staff_id
      AND start_time::date = p_date
      AND (
        (start_time::time <= p_start_time AND end_time::time > p_start_time)
        OR (start_time::time < p_end_time AND end_time::time >= p_end_time)
        OR (start_time::time >= p_start_time AND end_time::time <= p_end_time)
      )
  ) INTO v_has_time_off;
  
  IF v_has_time_off THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_staff_available IS 'Check if staff member is available at given date/time';

-- ============================================================================
-- 10. Create RLS Policies
-- ============================================================================

-- Staff Schedules
ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists, then create
DROP POLICY IF EXISTS staff_schedules_provider_access ON staff_schedules;
CREATE POLICY staff_schedules_provider_access ON staff_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = staff_schedules.provider_id
      AND p.user_id = auth.uid()
    )
  );

-- Staff Time Off
ALTER TABLE staff_time_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_time_off_provider_access ON staff_time_off;
CREATE POLICY staff_time_off_provider_access ON staff_time_off
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = staff_time_off.provider_id
      AND p.user_id = auth.uid()
    )
  );

-- Staff Services
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_services_provider_access ON staff_services;
CREATE POLICY staff_services_provider_access ON staff_services
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = staff_services.provider_id
      AND p.user_id = auth.uid()
    )
  );

-- Time Blocks
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_blocks_provider_access ON time_blocks;
CREATE POLICY time_blocks_provider_access ON time_blocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = time_blocks.provider_id
      AND p.user_id = auth.uid()
    )
  );

-- Offering Locations
ALTER TABLE offering_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offering_locations_provider_access ON offering_locations;
CREATE POLICY offering_locations_provider_access ON offering_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = offering_locations.provider_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- DONE
-- ============================================================================

-- Refresh updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_staff_schedules_updated_at ON staff_schedules;
CREATE TRIGGER update_staff_schedules_updated_at BEFORE UPDATE ON staff_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_time_off_updated_at ON staff_time_off;
CREATE TRIGGER update_staff_time_off_updated_at BEFORE UPDATE ON staff_time_off
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_blocks_updated_at ON time_blocks;
CREATE TRIGGER update_time_blocks_updated_at BEFORE UPDATE ON time_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
