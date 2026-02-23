-- Custom field values: store one value per (entity_type, entity_id, custom_field_id).
-- entity_type in ('user','provider','booking','service'); entity_id = users.id, providers.id, bookings.id, offerings.id (for service).
CREATE TABLE IF NOT EXISTS public.custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('user', 'provider', 'booking', 'service')),
    entity_id UUID NOT NULL,
    custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id, custom_field_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity ON public.custom_field_values(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_custom_field ON public.custom_field_values(custom_field_id);

CREATE OR REPLACE FUNCTION update_custom_field_values_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_custom_field_values_updated_at ON public.custom_field_values;
CREATE TRIGGER update_custom_field_values_updated_at
    BEFORE UPDATE ON public.custom_field_values
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_field_values_updated_at();

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active custom_fields (definitions) so provider/customer apps can render forms
CREATE POLICY "Authenticated users can view active custom fields"
    ON public.custom_fields
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND is_active = true
    );

-- custom_field_values: provider can read/write for their provider row, their bookings, their offerings
CREATE POLICY "Provider can manage own provider custom values"
    ON public.custom_field_values
    FOR ALL
    USING (
        entity_type = 'provider'
        AND entity_id IN (
            SELECT id FROM public.providers
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        entity_type = 'provider'
        AND entity_id IN (
            SELECT id FROM public.providers
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Provider can manage custom values for own bookings"
    ON public.custom_field_values
    FOR ALL
    USING (
        entity_type = 'booking'
        AND entity_id IN (
            SELECT id FROM public.bookings
            WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
        )
    )
    WITH CHECK (
        entity_type = 'booking'
        AND entity_id IN (
            SELECT id FROM public.bookings
            WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Provider can manage custom values for own offerings (service)"
    ON public.custom_field_values
    FOR ALL
    USING (
        entity_type = 'service'
        AND entity_id IN (
            SELECT id FROM public.offerings
            WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
        )
    )
    WITH CHECK (
        entity_type = 'service'
        AND entity_id IN (
            SELECT id FROM public.offerings
            WHERE provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
        )
    );

-- Customer can read/write for their user profile and for bookings where they are the customer
CREATE POLICY "User can manage own user custom values"
    ON public.custom_field_values
    FOR ALL
    USING (
        entity_type = 'user'
        AND entity_id = auth.uid()
    )
    WITH CHECK (
        entity_type = 'user'
        AND entity_id = auth.uid()
    );

CREATE POLICY "User can manage custom values for own bookings"
    ON public.custom_field_values
    FOR ALL
    USING (
        entity_type = 'booking'
        AND entity_id IN (
            SELECT id FROM public.bookings
            WHERE customer_id = auth.uid()
        )
    )
    WITH CHECK (
        entity_type = 'booking'
        AND entity_id IN (
            SELECT id FROM public.bookings
            WHERE customer_id = auth.uid()
        )
    );

-- Superadmin can do everything on custom_field_values
CREATE POLICY "Superadmins can manage all custom field values"
    ON public.custom_field_values
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

COMMENT ON TABLE public.custom_field_values IS 'Values for platform-defined custom fields; entity_id for service = offerings.id';
