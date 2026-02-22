-- Create custom_fields table
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'email', 'phone', 'date', 'select', 'checkbox', 'radio')),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('user', 'provider', 'booking', 'service')),
    is_required BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    placeholder TEXT,
    help_text TEXT,
    default_value TEXT,
    display_order INTEGER DEFAULT 0,
    validation_rules JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, entity_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_type ON public.custom_fields(entity_type);
CREATE INDEX IF NOT EXISTS idx_custom_fields_is_active ON public.custom_fields(is_active);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_custom_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_custom_fields_updated_at
    BEFORE UPDATE ON public.custom_fields
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_fields_updated_at();

-- Enable RLS
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only superadmins can view and manage custom fields
CREATE POLICY "Superadmins can view custom fields"
    ON public.custom_fields
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can insert custom fields"
    ON public.custom_fields
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can update custom fields"
    ON public.custom_fields
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can delete custom fields"
    ON public.custom_fields
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
