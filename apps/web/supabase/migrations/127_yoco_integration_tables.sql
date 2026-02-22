-- Beautonomi Database Migration
-- 127_yoco_integration_tables.sql
-- Creates Yoco integration tables for POS terminal payments

-- Provider Yoco Integration Settings
CREATE TABLE IF NOT EXISTS provider_yoco_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
    secret_key TEXT, -- Yoco Secret Key (encrypted in production)
    public_key TEXT, -- Yoco Public Key
    webhook_secret TEXT, -- Webhook Secret for verification
    is_enabled BOOLEAN DEFAULT false,
    connected_date TIMESTAMP WITH TIME ZONE,
    last_sync TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider Yoco Devices (Web POS Terminals)
-- IMPORTANT: For multi-location providers, each device should be assigned to a specific location
-- This ensures the correct terminal is used for appointments at each salon
CREATE TABLE IF NOT EXISTS provider_yoco_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Human-friendly name (e.g., "Main Counter Terminal", "Sandton Branch Terminal")
    yoco_device_id TEXT NOT NULL, -- Yoco Web POS Device ID from Yoco Dashboard
    location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL, -- CRITICAL: Assign device to specific location
    location_name TEXT, -- Denormalized for quick access (e.g., "Sandton Branch")
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    total_transactions INTEGER DEFAULT 0,
    total_amount BIGINT DEFAULT 0, -- In cents
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, yoco_device_id)
);

-- Provider Yoco Terminals (Legacy/Separate Table)
CREATE TABLE IF NOT EXISTS provider_yoco_terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL UNIQUE, -- Yoco Device ID
    device_name TEXT NOT NULL,
    api_key TEXT, -- Encrypted in production
    secret_key TEXT, -- Encrypted in production
    location_name TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider Yoco Payments (Transaction Records)
CREATE TABLE IF NOT EXISTS provider_yoco_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    device_id UUID REFERENCES provider_yoco_devices(id) ON DELETE SET NULL,
    yoco_payment_id TEXT, -- Yoco transaction ID
    yoco_device_id TEXT, -- Yoco Web POS Device ID
    amount BIGINT NOT NULL, -- In cents
    currency TEXT NOT NULL DEFAULT 'ZAR',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, successful, failed, cancelled
    appointment_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    sale_id UUID, -- For retail/product sales
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_yoco_integrations_provider ON provider_yoco_integrations(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_integrations_enabled ON provider_yoco_integrations(is_enabled);

CREATE INDEX IF NOT EXISTS idx_yoco_devices_provider ON provider_yoco_devices(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_devices_location ON provider_yoco_devices(location_id);
CREATE INDEX IF NOT EXISTS idx_yoco_devices_active ON provider_yoco_devices(is_active);
CREATE INDEX IF NOT EXISTS idx_yoco_devices_last_used ON provider_yoco_devices(last_used DESC);
-- Critical index for multi-location providers: quickly find active devices at a specific location
CREATE INDEX IF NOT EXISTS idx_yoco_devices_location_active ON provider_yoco_devices(provider_id, location_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_yoco_terminals_provider ON provider_yoco_terminals(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_terminals_device ON provider_yoco_terminals(device_id);

CREATE INDEX IF NOT EXISTS idx_yoco_payments_provider ON provider_yoco_payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_payments_device ON provider_yoco_payments(device_id);
CREATE INDEX IF NOT EXISTS idx_yoco_payments_appointment ON provider_yoco_payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_yoco_payments_status ON provider_yoco_payments(status);
CREATE INDEX IF NOT EXISTS idx_yoco_payments_created ON provider_yoco_payments(created_at DESC);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_yoco_integrations_updated_at ON provider_yoco_integrations;
CREATE TRIGGER update_yoco_integrations_updated_at
    BEFORE UPDATE ON provider_yoco_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_yoco_devices_updated_at ON provider_yoco_devices;
CREATE TRIGGER update_yoco_devices_updated_at
    BEFORE UPDATE ON provider_yoco_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_yoco_terminals_updated_at ON provider_yoco_terminals;
CREATE TRIGGER update_yoco_terminals_updated_at
    BEFORE UPDATE ON provider_yoco_terminals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_yoco_payments_updated_at ON provider_yoco_payments;
CREATE TRIGGER update_yoco_payments_updated_at
    BEFORE UPDATE ON provider_yoco_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE provider_yoco_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_yoco_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_yoco_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_yoco_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_yoco_integrations
DROP POLICY IF EXISTS "Providers can view their own Yoco integration" ON provider_yoco_integrations;
CREATE POLICY "Providers can view their own Yoco integration"
    ON provider_yoco_integrations FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can update their own Yoco integration" ON provider_yoco_integrations;
CREATE POLICY "Providers can update their own Yoco integration"
    ON provider_yoco_integrations FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for provider_yoco_devices
DROP POLICY IF EXISTS "Providers can view their own Yoco devices" ON provider_yoco_devices;
CREATE POLICY "Providers can view their own Yoco devices"
    ON provider_yoco_devices FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage their own Yoco devices" ON provider_yoco_devices;
CREATE POLICY "Providers can manage their own Yoco devices"
    ON provider_yoco_devices FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for provider_yoco_terminals
DROP POLICY IF EXISTS "Providers can view their own Yoco terminals" ON provider_yoco_terminals;
CREATE POLICY "Providers can view their own Yoco terminals"
    ON provider_yoco_terminals FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage their own Yoco terminals" ON provider_yoco_terminals;
CREATE POLICY "Providers can manage their own Yoco terminals"
    ON provider_yoco_terminals FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for provider_yoco_payments
DROP POLICY IF EXISTS "Providers can view their own Yoco payments" ON provider_yoco_payments;
CREATE POLICY "Providers can view their own Yoco payments"
    ON provider_yoco_payments FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can create their own Yoco payments" ON provider_yoco_payments;
CREATE POLICY "Providers can create their own Yoco payments"
    ON provider_yoco_payments FOR INSERT
    WITH CHECK (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- Comments
COMMENT ON TABLE provider_yoco_integrations IS 'Stores Yoco API credentials and integration settings for providers';
COMMENT ON TABLE provider_yoco_devices IS 'Stores Yoco Web POS devices registered by providers. Each device should be assigned to a specific location for multi-location providers';
COMMENT ON TABLE provider_yoco_terminals IS 'Legacy table for Yoco terminals (being phased out in favor of provider_yoco_devices)';
COMMENT ON TABLE provider_yoco_payments IS 'Records all Yoco payment transactions processed through Web POS terminals';

COMMENT ON COLUMN provider_yoco_integrations.secret_key IS 'Yoco Secret Key for API authentication (should be encrypted in production)';
COMMENT ON COLUMN provider_yoco_integrations.public_key IS 'Yoco Public Key for client-side operations';
COMMENT ON COLUMN provider_yoco_integrations.webhook_secret IS 'Secret for verifying Yoco webhook signatures';
COMMENT ON COLUMN provider_yoco_devices.yoco_device_id IS 'Yoco Web POS Device ID obtained from Yoco Dashboard';
COMMENT ON COLUMN provider_yoco_devices.location_id IS 'CRITICAL: Assign each Yoco device to a specific salon location. For multi-location providers, this ensures the correct terminal is used at each location';
COMMENT ON COLUMN provider_yoco_devices.location_name IS 'Denormalized location name for quick display (e.g., "Sandton Branch", "Main Location")';
COMMENT ON COLUMN provider_yoco_payments.amount IS 'Payment amount in cents (divide by 100 for actual amount)';
COMMENT ON COLUMN provider_yoco_payments.status IS 'Payment status: pending, successful, failed, cancelled';
