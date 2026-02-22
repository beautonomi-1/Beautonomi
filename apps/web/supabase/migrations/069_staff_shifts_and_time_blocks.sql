-- Beautonomi Database Migration
-- 069_staff_shifts_and_time_blocks.sql
-- Creates tables for staff scheduling and time blocks

-- Drop tables if they exist (to handle partial migrations)
DROP TABLE IF EXISTS public.time_blocks CASCADE;
DROP TABLE IF EXISTS public.blocked_time_types CASCADE;
DROP TABLE IF EXISTS public.staff_shifts CASCADE;

-- Staff Shifts table
CREATE TABLE public.staff_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern JSONB, -- {frequency: 'weekly', days: [0,1,2,3,4], end_date: '2025-12-31'}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(staff_id, date)
);

-- Blocked Time Types table
CREATE TABLE public.blocked_time_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#FF0077',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Time Blocks table (for blocking time slots)
CREATE TABLE public.time_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE CASCADE, -- NULL means applies to all staff
    blocked_time_type_id UUID REFERENCES blocked_time_types(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern JSONB, -- {frequency: 'weekly', days: [0,1,2,3,4], end_date: '2025-12-31'}
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_staff_shifts_provider ON staff_shifts(provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff ON staff_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_date ON staff_shifts(date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_date ON staff_shifts(staff_id, date);

CREATE INDEX IF NOT EXISTS idx_blocked_time_types_provider ON blocked_time_types(provider_id);
CREATE INDEX IF NOT EXISTS idx_blocked_time_types_active ON blocked_time_types(provider_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_time_blocks_provider ON time_blocks(provider_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_staff ON time_blocks(staff_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);
CREATE INDEX IF NOT EXISTS idx_time_blocks_active ON time_blocks(provider_id, is_active) WHERE is_active = true;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_staff_shifts_updated_at ON staff_shifts;
CREATE TRIGGER update_staff_shifts_updated_at BEFORE UPDATE ON staff_shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_blocked_time_types_updated_at ON blocked_time_types;
CREATE TRIGGER update_blocked_time_types_updated_at BEFORE UPDATE ON blocked_time_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_blocks_updated_at ON time_blocks;
CREATE TRIGGER update_time_blocks_updated_at BEFORE UPDATE ON time_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_time_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff_shifts
DROP POLICY IF EXISTS "Providers can view own staff shifts" ON staff_shifts;
CREATE POLICY "Providers can view own staff shifts"
    ON staff_shifts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_shifts.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage staff shifts" ON staff_shifts;
CREATE POLICY "Provider owners can manage staff shifts"
    ON staff_shifts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = staff_shifts.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for blocked_time_types
DROP POLICY IF EXISTS "Providers can view own blocked time types" ON blocked_time_types;
CREATE POLICY "Providers can view own blocked time types"
    ON blocked_time_types FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = blocked_time_types.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage blocked time types" ON blocked_time_types;
CREATE POLICY "Provider owners can manage blocked time types"
    ON blocked_time_types FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = blocked_time_types.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for time_blocks
DROP POLICY IF EXISTS "Providers can view own time blocks" ON time_blocks;
CREATE POLICY "Providers can view own time blocks"
    ON time_blocks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = time_blocks.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage time blocks" ON time_blocks;
CREATE POLICY "Provider owners can manage time blocks"
    ON time_blocks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = time_blocks.provider_id
            AND providers.user_id = auth.uid()
        )
    );
