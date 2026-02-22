-- Beautonomi Database Migration
-- 163_create_referral_sources_table.sql
-- Creates referral_sources table for provider-specific referral sources

-- Referral Sources table
CREATE TABLE IF NOT EXISTS public.referral_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_referral_sources_provider ON referral_sources(provider_id);
CREATE INDEX IF NOT EXISTS idx_referral_sources_active ON referral_sources(provider_id, is_active) WHERE is_active = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_referral_sources_updated_at ON referral_sources;
CREATE TRIGGER update_referral_sources_updated_at BEFORE UPDATE ON referral_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_sources
DROP POLICY IF EXISTS "Providers can manage own referral sources" ON referral_sources;
CREATE POLICY "Providers can manage own referral sources"
    ON referral_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = referral_sources.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- Add superadmin policy
DROP POLICY IF EXISTS "Superadmins can manage all referral sources" ON referral_sources;
CREATE POLICY "Superadmins can manage all referral sources"
    ON referral_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add comments
COMMENT ON TABLE public.referral_sources IS 'Provider-specific referral sources for tracking where clients come from';
COMMENT ON COLUMN public.referral_sources.name IS 'Name of the referral source (e.g., Google, Facebook, Referral)';
COMMENT ON COLUMN public.referral_sources.description IS 'Optional description of the referral source';
COMMENT ON COLUMN public.referral_sources.is_active IS 'Whether this referral source is currently active';
