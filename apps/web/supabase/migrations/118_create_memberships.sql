-- Create memberships table
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'ZAR',
    billing_period VARCHAR(20) NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    max_bookings_per_month INTEGER,
    max_staff_members INTEGER,
    max_locations INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_memberships_is_active ON public.memberships(is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_billing_period ON public.memberships(billing_period);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON public.memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_memberships_updated_at();

-- Enable RLS
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only superadmins can view and manage memberships
CREATE POLICY "Superadmins can view memberships"
    ON public.memberships
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Allow authenticated users to view active memberships (for provider selection)
CREATE POLICY "Authenticated users can view active memberships"
    ON public.memberships
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND is_active = true
    );

CREATE POLICY "Superadmins can insert memberships"
    ON public.memberships
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can update memberships"
    ON public.memberships
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can delete memberships"
    ON public.memberships
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add membership_id to providers table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'providers' AND column_name = 'membership_id'
    ) THEN
        ALTER TABLE public.providers
        ADD COLUMN membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_providers_membership_id ON public.providers(membership_id);
    END IF;
END $$;
