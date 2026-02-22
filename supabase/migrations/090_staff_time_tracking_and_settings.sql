-- Beautonomi Database Migration
-- 090_staff_time_tracking_and_settings.sql
-- Creates tables for staff time tracking (time clock, days off) and adds missing staff settings columns

-- Add missing columns to provider_staff table for time clock and settings
DO $$
BEGIN
    -- Time clock settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'time_clock_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN time_clock_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'time_clock_pin') THEN
        ALTER TABLE provider_staff ADD COLUMN time_clock_pin TEXT;
    END IF;
    
    -- Service provider settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'is_service_provider') THEN
        ALTER TABLE provider_staff ADD COLUMN is_service_provider BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'enable_in_online_booking') THEN
        ALTER TABLE provider_staff ADD COLUMN enable_in_online_booking BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'can_be_assigned_to_product_sales') THEN
        ALTER TABLE provider_staff ADD COLUMN can_be_assigned_to_product_sales BOOLEAN DEFAULT false;
    END IF;
    
    -- Admin and permissions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'is_admin') THEN
        ALTER TABLE provider_staff ADD COLUMN is_admin BOOLEAN DEFAULT false;
    END IF;
    
    -- Notification settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'email_notifications_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'sms_notifications_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN sms_notifications_enabled BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'desktop_notifications_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN desktop_notifications_enabled BOOLEAN DEFAULT false;
    END IF;
    
    -- Work hours
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'work_hours_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN work_hours_enabled BOOLEAN DEFAULT true;
    END IF;
    
    -- Commission settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'commission_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN commission_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'commission_rate') THEN
        ALTER TABLE provider_staff ADD COLUMN commission_rate NUMERIC(5, 2) DEFAULT 0;
    END IF;
    
    -- Compensation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'hourly_rate') THEN
        ALTER TABLE provider_staff ADD COLUMN hourly_rate NUMERIC(10, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'salary') THEN
        ALTER TABLE provider_staff ADD COLUMN salary NUMERIC(10, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'tips_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN tips_enabled BOOLEAN DEFAULT true;
    END IF;
    
    -- Phone availability
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'phone_call_availability_enabled') THEN
        ALTER TABLE provider_staff ADD COLUMN phone_call_availability_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Staff Time Cards table (for time clock functionality)
CREATE TABLE IF NOT EXISTS public.staff_time_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
    clock_out_time TIMESTAMP WITH TIME ZONE,
    total_hours NUMERIC(5, 2), -- Calculated hours (can be manually adjusted)
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_staff_date_clock_in UNIQUE(staff_id, date, clock_in_time)
);

-- Staff Days Off table
CREATE TABLE IF NOT EXISTS public.staff_days_off (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    reason TEXT,
    type TEXT, -- e.g., 'vacation', 'sick', 'personal', 'holiday'
    is_approved BOOLEAN DEFAULT true, -- For future approval workflow
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(staff_id, date) -- One day off per staff member per date
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_provider ON staff_time_cards(provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_staff ON staff_time_cards(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_date ON staff_time_cards(date);
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_staff_date ON staff_time_cards(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_time_cards_active ON staff_time_cards(staff_id, date) WHERE clock_out_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_days_off_provider ON staff_days_off(provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_days_off_staff ON staff_days_off(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_days_off_date ON staff_days_off(date);
CREATE INDEX IF NOT EXISTS idx_staff_days_off_staff_date ON staff_days_off(staff_id, date);

-- Function to automatically calculate total_hours when clock_out_time is set
CREATE OR REPLACE FUNCTION calculate_time_card_hours()
RETURNS TRIGGER AS $$
BEGIN
    -- If clock_out_time is set and total_hours is NULL, calculate it
    IF NEW.clock_out_time IS NOT NULL AND (NEW.total_hours IS NULL OR OLD.clock_out_time IS NULL) THEN
        NEW.total_hours := EXTRACT(EPOCH FROM (NEW.clock_out_time - NEW.clock_in_time)) / 3600.0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at (only if function exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        DROP TRIGGER IF EXISTS update_staff_time_cards_updated_at ON staff_time_cards;
        CREATE TRIGGER update_staff_time_cards_updated_at BEFORE UPDATE ON staff_time_cards
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_staff_days_off_updated_at ON staff_days_off;
        CREATE TRIGGER update_staff_days_off_updated_at BEFORE UPDATE ON staff_days_off
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Trigger to auto-calculate hours on clock out
DROP TRIGGER IF EXISTS calculate_time_card_hours_trigger ON staff_time_cards;
CREATE TRIGGER calculate_time_card_hours_trigger 
    BEFORE INSERT OR UPDATE ON staff_time_cards
    FOR EACH ROW 
    WHEN (NEW.clock_out_time IS NOT NULL)
    EXECUTE FUNCTION calculate_time_card_hours();

-- Enable Row Level Security
ALTER TABLE staff_time_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_days_off ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff_time_cards
DROP POLICY IF EXISTS "Providers can view own staff time cards" ON staff_time_cards;
CREATE POLICY "Providers can view own staff time cards"
    ON staff_time_cards FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_time_cards.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.id = staff_time_cards.staff_id
                ))
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage staff time cards" ON staff_time_cards;
CREATE POLICY "Provider owners can manage staff time cards"
    ON staff_time_cards FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_time_cards.provider_id
            AND providers.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Staff can clock in/out themselves" ON staff_time_cards;
CREATE POLICY "Staff can clock in/out themselves"
    ON staff_time_cards FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.id = staff_time_cards.staff_id
            AND provider_staff.user_id = auth.uid()
            AND provider_staff.time_clock_enabled = true
        )
    );

-- RLS Policies for staff_days_off
DROP POLICY IF EXISTS "Providers can view own staff days off" ON staff_days_off;
CREATE POLICY "Providers can view own staff days off"
    ON staff_days_off FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_days_off.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.id = staff_days_off.staff_id
                ))
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage staff days off" ON staff_days_off;
CREATE POLICY "Provider owners can manage staff days off"
    ON staff_days_off FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_days_off.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Comments for documentation
COMMENT ON TABLE staff_time_cards IS 'Tracks staff clock in/out times and hours worked';
COMMENT ON TABLE staff_days_off IS 'Tracks staff days off, vacation, and time off requests';
COMMENT ON COLUMN provider_staff.time_clock_enabled IS 'Whether this staff member can use the time clock';
COMMENT ON COLUMN provider_staff.time_clock_pin IS '4-digit PIN for front desk time clock access';
COMMENT ON COLUMN provider_staff.is_service_provider IS 'Whether this staff member can provide services';
COMMENT ON COLUMN provider_staff.enable_in_online_booking IS 'Whether this staff member appears in online booking';
COMMENT ON COLUMN provider_staff.can_be_assigned_to_product_sales IS 'Whether this staff member can be assigned to product sales';
COMMENT ON COLUMN provider_staff.is_admin IS 'Whether this staff member has admin permissions';
COMMENT ON COLUMN provider_staff.commission_rate IS 'Commission rate as percentage (0-100)';
