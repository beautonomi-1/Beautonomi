-- Beautonomi Database Migration
-- 043_provider_clients.sql
-- Creates provider client management system

-- Provider clients table (for manually saved clients)
CREATE TABLE IF NOT EXISTS provider_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT, -- Provider's notes about this client
    tags TEXT[], -- Custom tags for organizing clients
    is_favorite BOOLEAN DEFAULT false,
    last_service_date TIMESTAMP WITH TIME ZONE, -- Last booking date with this provider
    total_bookings INTEGER DEFAULT 0, -- Total bookings with this provider
    total_spent NUMERIC(10, 2) DEFAULT 0, -- Total amount spent with this provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, customer_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_clients_provider ON provider_clients(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_clients_customer ON provider_clients(customer_id);
CREATE INDEX IF NOT EXISTS idx_provider_clients_favorite ON provider_clients(provider_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_provider_clients_last_service ON provider_clients(provider_id, last_service_date DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_provider_clients_updated_at BEFORE UPDATE ON provider_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update provider client stats from bookings
CREATE OR REPLACE FUNCTION update_provider_client_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update provider_clients stats when booking is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Update or insert client stats
        INSERT INTO provider_clients (provider_id, customer_id, last_service_date, total_bookings, total_spent)
        VALUES (
            NEW.provider_id,
            NEW.customer_id,
            COALESCE(NEW.completed_at, NOW()),
            1,
            COALESCE(NEW.total_amount, 0)
        )
        ON CONFLICT (provider_id, customer_id)
        DO UPDATE SET
            last_service_date = GREATEST(
                COALESCE(provider_clients.last_service_date, '1970-01-01'::timestamp),
                COALESCE(NEW.completed_at, NOW())
            ),
            total_bookings = provider_clients.total_bookings + 1,
            total_spent = provider_clients.total_spent + COALESCE(NEW.total_amount, 0),
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update provider client stats
CREATE TRIGGER on_booking_completed_for_client_stats
    AFTER INSERT OR UPDATE ON bookings
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION update_provider_client_stats();

-- Enable Row Level Security
ALTER TABLE provider_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Providers can view own clients"
    ON provider_clients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can create own clients"
    ON provider_clients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can update own clients"
    ON provider_clients FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can delete own clients"
    ON provider_clients FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Add comments
COMMENT ON TABLE provider_clients IS 'Manually saved clients by providers';
COMMENT ON COLUMN provider_clients.notes IS 'Provider notes about the client';
COMMENT ON COLUMN provider_clients.tags IS 'Custom tags for organizing clients';
COMMENT ON COLUMN provider_clients.is_favorite IS 'Mark client as favorite';
COMMENT ON COLUMN provider_clients.last_service_date IS 'Date of last completed booking';
COMMENT ON COLUMN provider_clients.total_bookings IS 'Total number of completed bookings';
COMMENT ON COLUMN provider_clients.total_spent IS 'Total amount spent by client with this provider';
