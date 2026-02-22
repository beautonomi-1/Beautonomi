-- Beautonomi Database Migration
-- 040_travel_fee_settings.sql
-- Creates travel fee configuration system for platform and providers

-- Provider travel fee settings table
CREATE TABLE IF NOT EXISTS provider_travel_fee_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    rate_per_km NUMERIC(10, 2) NOT NULL DEFAULT 8.00 CHECK (rate_per_km >= 0),
    minimum_fee NUMERIC(10, 2) NOT NULL DEFAULT 20.00 CHECK (minimum_fee >= 0),
    maximum_fee NUMERIC(10, 2), -- NULL means no maximum
    currency TEXT NOT NULL DEFAULT 'ZAR',
    use_platform_default BOOLEAN DEFAULT false, -- If true, use platform settings instead
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_provider_travel_fee_settings_provider ON provider_travel_fee_settings(provider_id);

-- Create trigger for updated_at
CREATE TRIGGER update_provider_travel_fee_settings_updated_at BEFORE UPDATE ON provider_travel_fee_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE provider_travel_fee_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_travel_fee_settings
CREATE POLICY "Public can view active provider travel fee settings"
    ON provider_travel_fee_settings FOR SELECT
    USING (enabled = true);

CREATE POLICY "Providers can view own travel fee settings"
    ON provider_travel_fee_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_travel_fee_settings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can manage own travel fee settings"
    ON provider_travel_fee_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_travel_fee_settings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Superadmins can manage all travel fee settings"
    ON provider_travel_fee_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Insert default platform travel fee settings into platform_settings
-- This will be stored in the JSONB settings column
INSERT INTO platform_settings (settings, is_active)
VALUES (
    jsonb_build_object(
        'travel_fees', jsonb_build_object(
            'default_rate_per_km', 8.00,
            'default_minimum_fee', 20.00,
            'default_maximum_fee', null,
            'default_currency', 'ZAR',
            'allow_provider_customization', true,
            'provider_min_rate_per_km', 0.00, -- Minimum providers can set
            'provider_max_rate_per_km', 50.00, -- Maximum providers can set
            'provider_min_minimum_fee', 0.00,
            'provider_max_minimum_fee', 100.00
        )
    ),
    true
)
ON CONFLICT DO NOTHING;

-- Function to get effective travel fee settings for a provider
-- Returns provider settings if they exist and enabled, otherwise platform defaults
CREATE OR REPLACE FUNCTION get_provider_travel_fee_settings(p_provider_id UUID)
RETURNS TABLE (
    rate_per_km NUMERIC,
    minimum_fee NUMERIC,
    maximum_fee NUMERIC,
    currency TEXT
) AS $$
DECLARE
    v_provider_settings RECORD;
    v_platform_settings JSONB;
BEGIN
    -- Get provider settings
    SELECT * INTO v_provider_settings
    FROM provider_travel_fee_settings
    WHERE provider_id = p_provider_id
    AND enabled = true;

    -- Get platform settings
    SELECT settings->'travel_fees' INTO v_platform_settings
    FROM platform_settings
    WHERE is_active = true
    LIMIT 1;

    -- If provider has custom settings and not using platform default
    IF v_provider_settings IS NOT NULL AND v_provider_settings.use_platform_default = false THEN
        RETURN QUERY SELECT
            v_provider_settings.rate_per_km,
            v_provider_settings.minimum_fee,
            v_provider_settings.maximum_fee,
            v_provider_settings.currency;
    ELSE
        -- Return platform defaults
        RETURN QUERY SELECT
            (v_platform_settings->>'default_rate_per_km')::NUMERIC,
            (v_platform_settings->>'default_minimum_fee')::NUMERIC,
            NULLIF((v_platform_settings->>'default_maximum_fee')::NUMERIC, 0),
            COALESCE(v_platform_settings->>'default_currency', 'ZAR');
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
