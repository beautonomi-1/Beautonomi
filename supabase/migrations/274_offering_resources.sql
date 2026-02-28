-- Beautonomi Database Migration
-- 274_offering_resources.sql
-- Links offerings (services) to required or optional resources (rooms, equipment).

-- Offering Resources: which resources an offering (service) requires or can use
CREATE TABLE IF NOT EXISTS public.offering_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(offering_id, resource_id),
    -- Resource must belong to the same provider as the offering
    CONSTRAINT offering_resources_same_provider CHECK (
        EXISTS (
            SELECT 1 FROM offerings o
            JOIN resources r ON r.id = resource_id AND r.provider_id = o.provider_id
            WHERE o.id = offering_id
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_offering_resources_offering ON offering_resources(offering_id);
CREATE INDEX IF NOT EXISTS idx_offering_resources_resource ON offering_resources(resource_id);

DROP TRIGGER IF EXISTS update_offering_resources_updated_at ON offering_resources;
CREATE TRIGGER update_offering_resources_updated_at
    BEFORE UPDATE ON offering_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE offering_resources ENABLE ROW LEVEL SECURITY;

-- Providers can manage offering_resources for their own offerings
DROP POLICY IF EXISTS "Providers can manage offering_resources for own offerings" ON offering_resources;
CREATE POLICY "Providers can manage offering_resources for own offerings"
    ON offering_resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM offerings o
            JOIN providers p ON p.id = o.provider_id
            WHERE o.id = offering_resources.offering_id
            AND (p.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM provider_staff ps
                WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
            ))
        )
    )
    WITH CHECK (
        -- On INSERT/UPDATE, resource must belong to the same provider as the offering
        EXISTS (
            SELECT 1 FROM offerings o
            JOIN providers p ON p.id = o.provider_id
            JOIN resources r ON r.id = offering_resources.resource_id AND r.provider_id = p.id
            WHERE o.id = offering_resources.offering_id
            AND (p.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM provider_staff ps
                WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
            ))
        )
    );

-- Public read for offerings (needed for booking flow to know required resources)
DROP POLICY IF EXISTS "Public can read offering_resources for offerings" ON offering_resources;
CREATE POLICY "Public can read offering_resources for offerings"
    ON offering_resources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM offerings o
            JOIN resources r ON r.id = offering_resources.resource_id AND r.is_active = true
            WHERE o.id = offering_resources.offering_id
            AND o.is_active = true
        )
    );
