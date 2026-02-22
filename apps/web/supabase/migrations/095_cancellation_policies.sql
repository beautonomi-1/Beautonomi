-- Beautonomi Database Migration
-- 095_cancellation_policies.sql
-- Creates cancellation policies table and enforcement

-- Cancellation Policies table
CREATE TABLE IF NOT EXISTS public.cancellation_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    location_type TEXT CHECK (location_type IN ('at_salon', 'at_home')) DEFAULT NULL, -- NULL = applies to both
    hours_before_cutoff INTEGER NOT NULL DEFAULT 24, -- Must cancel N hours before appointment
    grace_window_minutes INTEGER NOT NULL DEFAULT 15, -- Can always cancel within N minutes of booking creation
    policy_text TEXT NOT NULL, -- Human-readable policy text
    late_cancellation_type TEXT NOT NULL DEFAULT 'no_refund' CHECK (late_cancellation_type IN ('no_refund', 'partial_refund', 'full_refund')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- One policy per provider per location type (or NULL for both)
    UNIQUE(provider_id, location_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cancellation_policies_provider ON cancellation_policies(provider_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_policies_active ON cancellation_policies(provider_id, is_active, location_type) WHERE is_active = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_cancellation_policies_updated_at ON cancellation_policies;
CREATE TRIGGER update_cancellation_policies_updated_at BEFORE UPDATE ON cancellation_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE cancellation_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cancellation_policies
DROP POLICY IF EXISTS "Public can view active cancellation policies" ON cancellation_policies;
CREATE POLICY "Public can view active cancellation policies"
    ON cancellation_policies FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = cancellation_policies.provider_id
            AND providers.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Providers can manage own cancellation policies" ON cancellation_policies;
CREATE POLICY "Providers can manage own cancellation policies"
    ON cancellation_policies FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = cancellation_policies.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Backfill default policies for existing providers
INSERT INTO public.cancellation_policies (provider_id, location_type, hours_before_cutoff, grace_window_minutes, policy_text, late_cancellation_type, is_active)
SELECT 
    id as provider_id,
    NULL as location_type, -- Applies to both at_salon and at_home
    24 as hours_before_cutoff,
    15 as grace_window_minutes,
    'Cancellations must be made at least 24 hours before your appointment. Cancellations made within 24 hours may be subject to a cancellation fee.' as policy_text,
    'no_refund' as late_cancellation_type,
    true as is_active
FROM providers
WHERE id NOT IN (
    SELECT DISTINCT provider_id FROM cancellation_policies WHERE location_type IS NULL
)
ON CONFLICT (provider_id, location_type) DO NOTHING;
