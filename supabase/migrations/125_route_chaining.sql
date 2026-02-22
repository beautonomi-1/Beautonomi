-- ============================================================================
-- Migration 125: Route Chaining & Travel Fee Optimization
-- ============================================================================
-- This migration adds:
-- 1. Travel route tracking and optimization
-- 2. Route segments for chained appointments
-- 3. Dynamic travel fee calculation based on routing
-- 4. Manual route adjustments and overrides
-- ============================================================================

-- Create travel_routes table (daily route optimization)
CREATE TABLE IF NOT EXISTS travel_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
    route_date DATE NOT NULL,
    starting_location_type TEXT CHECK (starting_location_type IN ('salon', 'home', 'custom')),
    starting_location_id UUID REFERENCES provider_locations(id),
    starting_address JSONB,
    ending_location_type TEXT CHECK (ending_location_type IN ('salon', 'home', 'custom')),
    ending_location_id UUID REFERENCES provider_locations(id),
    ending_address JSONB,
    total_distance_km NUMERIC(10, 2) DEFAULT 0,
    total_duration_minutes INTEGER DEFAULT 0,
    optimization_status TEXT DEFAULT 'pending' CHECK (optimization_status IN ('pending', 'optimized', 'manual')),
    optimized_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, route_date, staff_id)
);

-- Create route_segments table (leg of journey between appointments)
CREATE TABLE IF NOT EXISTS route_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES travel_routes(id) ON DELETE CASCADE,
    from_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    to_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL CHECK (distance_km >= 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
    travel_fee_calculated NUMERIC(10, 2) NOT NULL CHECK (travel_fee_calculated >= 0),
    travel_fee_charged NUMERIC(10, 2),
    from_location JSONB NOT NULL,
    to_location JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(route_id, segment_order)
);

-- Add route tracking to bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS route_segment_id UUID REFERENCES route_segments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS travel_distance_km NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS travel_duration_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS previous_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS next_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS travel_fee_method TEXT DEFAULT 'standard' CHECK (travel_fee_method IN ('standard', 'route_chained', 'override'));

-- Create travel_fee_config table (system configuration)
CREATE TABLE IF NOT EXISTS travel_fee_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    base_fee NUMERIC(10, 2) DEFAULT 20.00 CHECK (base_fee >= 0),
    per_km_rate NUMERIC(10, 2) DEFAULT 5.00 CHECK (per_km_rate >= 0),
    free_radius_km NUMERIC(10, 2) DEFAULT 5.0 CHECK (free_radius_km >= 0),
    min_fee NUMERIC(10, 2) DEFAULT 0,
    max_fee NUMERIC(10, 2),
    currency TEXT DEFAULT 'ZAR',
    apply_to_first_appointment BOOLEAN DEFAULT true,
    route_chaining_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_travel_routes_provider_date ON travel_routes(provider_id, route_date);
CREATE INDEX IF NOT EXISTS idx_travel_routes_staff_date ON travel_routes(staff_id, route_date) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_routes_status ON travel_routes(optimization_status);
CREATE INDEX IF NOT EXISTS idx_route_segments_route ON route_segments(route_id);
CREATE INDEX IF NOT EXISTS idx_route_segments_bookings ON route_segments(from_booking_id, to_booking_id);
CREATE INDEX IF NOT EXISTS idx_route_segments_to_booking ON route_segments(to_booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_route_segment ON bookings(route_segment_id) WHERE route_segment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_route_chain ON bookings(previous_booking_id, next_booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_travel_method ON bookings(travel_fee_method);

-- Triggers
DROP TRIGGER IF EXISTS update_travel_routes_updated_at ON travel_routes;
CREATE TRIGGER update_travel_routes_updated_at 
    BEFORE UPDATE ON travel_routes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_travel_fee_config_updated_at ON travel_fee_config;
CREATE TRIGGER update_travel_fee_config_updated_at 
    BEFORE UPDATE ON travel_fee_config
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE travel_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_fee_config ENABLE ROW LEVEL SECURITY;

-- Travel Routes Policies
DROP POLICY IF EXISTS "Providers can manage own routes" ON travel_routes;
CREATE POLICY "Providers can manage own routes"
    ON travel_routes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = travel_routes.provider_id
            AND (
                providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can view all routes" ON travel_routes;
CREATE POLICY "Superadmins can view all routes"
    ON travel_routes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Route Segments Policies
DROP POLICY IF EXISTS "Providers can view own route segments" ON route_segments;
CREATE POLICY "Providers can view own route segments"
    ON route_segments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM travel_routes
            JOIN providers ON providers.id = travel_routes.provider_id
            WHERE travel_routes.id = route_segments.route_id
            AND (
                providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can view all segments" ON route_segments;
CREATE POLICY "Superadmins can view all segments"
    ON route_segments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Travel Fee Config Policies
DROP POLICY IF EXISTS "Everyone can view travel fee config" ON travel_fee_config;
CREATE POLICY "Everyone can view travel fee config"
    ON travel_fee_config FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Superadmins can manage travel fee config" ON travel_fee_config;
CREATE POLICY "Superadmins can manage travel fee config"
    ON travel_fee_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Insert default travel fee configuration
INSERT INTO travel_fee_config (name, base_fee, per_km_rate, free_radius_km, min_fee, route_chaining_enabled) 
VALUES ('default', 20.00, 5.00, 5.0, 0, true)
ON CONFLICT (name) DO UPDATE SET 
    base_fee = EXCLUDED.base_fee,
    per_km_rate = EXCLUDED.per_km_rate,
    updated_at = NOW();

-- FUNCTIONS
-- ============================================================================

-- Function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance_km(
    lat1 NUMERIC,
    lng1 NUMERIC,
    lat2 NUMERIC,
    lng2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    r NUMERIC := 6371; -- Earth's radius in km
    dlat NUMERIC;
    dlng NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    -- Convert to radians
    dlat := radians(lat2 - lat1);
    dlng := radians(lng2 - lng1);
    
    -- Haversine formula
    a := sin(dlat/2) * sin(dlat/2) + 
         cos(radians(lat1)) * cos(radians(lat2)) * 
         sin(dlng/2) * sin(dlng/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN ROUND(r * c, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate route-chained travel fee
CREATE OR REPLACE FUNCTION calculate_chained_travel_fee(
    distance_km NUMERIC,
    is_first_in_route BOOLEAN DEFAULT false
) RETURNS NUMERIC AS $$
DECLARE
    config_record travel_fee_config%ROWTYPE;
    chargeable_distance NUMERIC;
    calculated_fee NUMERIC;
BEGIN
    -- Get active config
    SELECT * INTO config_record FROM travel_fee_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    
    IF config_record IS NULL THEN
        RETURN 0;
    END IF;
    
    -- If within free radius, no charge
    IF distance_km <= config_record.free_radius_km THEN
        RETURN 0;
    END IF;
    
    -- Calculate chargeable distance
    chargeable_distance := distance_km - config_record.free_radius_km;
    
    -- Calculate fee
    IF is_first_in_route AND config_record.apply_to_first_appointment THEN
        calculated_fee := config_record.base_fee + (chargeable_distance * config_record.per_km_rate);
    ELSE
        -- For chained appointments, only charge per-km rate (no base fee)
        calculated_fee := chargeable_distance * config_record.per_km_rate;
    END IF;
    
    -- Apply min/max constraints
    IF config_record.min_fee IS NOT NULL THEN
        calculated_fee := GREATEST(calculated_fee, config_record.min_fee);
    END IF;
    
    IF config_record.max_fee IS NOT NULL THEN
        calculated_fee := LEAST(calculated_fee, config_record.max_fee);
    END IF;
    
    RETURN ROUND(calculated_fee, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate standard (non-chained) travel fee
CREATE OR REPLACE FUNCTION calculate_standard_travel_fee(
    distance_km NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    config_record travel_fee_config%ROWTYPE;
    chargeable_distance NUMERIC;
    calculated_fee NUMERIC;
BEGIN
    SELECT * INTO config_record FROM travel_fee_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    
    IF config_record IS NULL OR distance_km <= config_record.free_radius_km THEN
        RETURN 0;
    END IF;
    
    chargeable_distance := distance_km - config_record.free_radius_km;
    calculated_fee := config_record.base_fee + (chargeable_distance * config_record.per_km_rate);
    
    IF config_record.min_fee IS NOT NULL THEN
        calculated_fee := GREATEST(calculated_fee, config_record.min_fee);
    END IF;
    
    IF config_record.max_fee IS NOT NULL THEN
        calculated_fee := LEAST(calculated_fee, config_record.max_fee);
    END IF;
    
    RETURN ROUND(calculated_fee, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get or create route for a day
CREATE OR REPLACE FUNCTION get_or_create_route(
    p_provider_id UUID,
    p_route_date DATE,
    p_staff_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_route_id UUID;
BEGIN
    -- Try to get existing route
    SELECT id INTO v_route_id
    FROM travel_routes
    WHERE provider_id = p_provider_id
    AND route_date = p_route_date
    AND (staff_id = p_staff_id OR (staff_id IS NULL AND p_staff_id IS NULL));
    
    -- Create if doesn't exist
    IF v_route_id IS NULL THEN
        INSERT INTO travel_routes (
            provider_id,
            staff_id,
            route_date,
            starting_location_type,
            optimization_status
        ) VALUES (
            p_provider_id,
            p_staff_id,
            p_route_date,
            'salon',
            'pending'
        )
        RETURNING id INTO v_route_id;
    END IF;
    
    RETURN v_route_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate travel fee savings with route chaining
CREATE OR REPLACE FUNCTION calculate_route_savings(
    p_route_id UUID
) RETURNS TABLE (
    standard_total NUMERIC,
    chained_total NUMERIC,
    savings NUMERIC,
    savings_percentage NUMERIC
) AS $$
DECLARE
    v_standard_total NUMERIC := 0;
    v_chained_total NUMERIC := 0;
    v_segment RECORD;
    v_provider_location JSONB;
BEGIN
    -- Get provider's starting location
    SELECT starting_address INTO v_provider_location
    FROM travel_routes
    WHERE id = p_route_id;
    
    -- Calculate both standard and chained fees for each segment
    FOR v_segment IN 
        SELECT * FROM route_segments
        WHERE route_id = p_route_id
        ORDER BY segment_order
    LOOP
        -- Standard fee (from salon to each appointment)
        v_standard_total := v_standard_total + calculate_standard_travel_fee(
            calculate_distance_km(
                (v_provider_location->>'lat')::NUMERIC,
                (v_provider_location->>'lng')::NUMERIC,
                (v_segment.to_location->>'lat')::NUMERIC,
                (v_segment.to_location->>'lng')::NUMERIC
            )
        );
        
        -- Chained fee (actual segment distance)
        v_chained_total := v_chained_total + COALESCE(v_segment.travel_fee_calculated, 0);
    END LOOP;
    
    RETURN QUERY SELECT 
        v_standard_total,
        v_chained_total,
        v_standard_total - v_chained_total AS savings,
        CASE 
            WHEN v_standard_total > 0 THEN 
                ROUND(((v_standard_total - v_chained_total) / v_standard_total) * 100, 2)
            ELSE 0 
        END AS savings_percentage;
END;
$$ LANGUAGE plpgsql STABLE;

-- COMMENTS
-- ============================================================================

COMMENT ON TABLE travel_routes IS 'Optimized daily routes for providers with at-home services';
COMMENT ON TABLE route_segments IS 'Individual legs of a route between appointments';
COMMENT ON TABLE travel_fee_config IS 'System-wide travel fee calculation configuration';

COMMENT ON COLUMN bookings.route_segment_id IS 'Links booking to its position in an optimized route';
COMMENT ON COLUMN bookings.travel_fee_method IS 'How travel fee was calculated: standard, route_chained, or override';
COMMENT ON COLUMN bookings.previous_booking_id IS 'Previous booking in route chain';
COMMENT ON COLUMN bookings.next_booking_id IS 'Next booking in route chain';

COMMENT ON FUNCTION calculate_distance_km IS 'Calculates distance between two lat/lng points using Haversine formula';
COMMENT ON FUNCTION calculate_chained_travel_fee IS 'Calculates travel fee for a segment in a route chain';
COMMENT ON FUNCTION calculate_standard_travel_fee IS 'Calculates standard travel fee from salon to destination';
COMMENT ON FUNCTION get_or_create_route IS 'Gets existing or creates new route for a provider on a specific date';
COMMENT ON FUNCTION calculate_route_savings IS 'Calculates cost savings from route optimization vs standard fees';
