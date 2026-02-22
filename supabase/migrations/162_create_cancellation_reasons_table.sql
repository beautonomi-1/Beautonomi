-- Beautonomi Database Migration
-- 162_create_cancellation_reasons_table.sql
-- Creates cancellation_reasons table for provider-specific cancellation reasons

-- Cancellation Reasons table
CREATE TABLE IF NOT EXISTS public.cancellation_reasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cancellation_reasons_provider ON cancellation_reasons(provider_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_reasons_active ON cancellation_reasons(provider_id, is_active) WHERE is_active = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_cancellation_reasons_updated_at ON cancellation_reasons;
CREATE TRIGGER update_cancellation_reasons_updated_at BEFORE UPDATE ON cancellation_reasons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE cancellation_reasons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cancellation_reasons
DROP POLICY IF EXISTS "Providers can manage own cancellation reasons" ON cancellation_reasons;
CREATE POLICY "Providers can manage own cancellation reasons"
    ON cancellation_reasons FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = cancellation_reasons.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- Add superadmin policy
DROP POLICY IF EXISTS "Superadmins can manage all cancellation reasons" ON cancellation_reasons;
CREATE POLICY "Superadmins can manage all cancellation reasons"
    ON cancellation_reasons FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add comments
COMMENT ON TABLE public.cancellation_reasons IS 'Provider-specific cancellation reasons for tracking why appointments are cancelled';
COMMENT ON COLUMN public.cancellation_reasons.name IS 'Name of the cancellation reason (e.g., Client Request, Weather, Emergency)';
COMMENT ON COLUMN public.cancellation_reasons.description IS 'Optional description of the cancellation reason';
COMMENT ON COLUMN public.cancellation_reasons.is_active IS 'Whether this cancellation reason is currently active';
