-- Migration: Calendar Syncs Table
-- 134_calendar_syncs_table.sql
-- Creates calendar_syncs table for calendar integration feature

-- Calendar Syncs table
CREATE TABLE IF NOT EXISTS public.calendar_syncs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'outlook', 'ical')),
    calendar_id TEXT, -- External calendar ID
    calendar_name TEXT, -- User-friendly calendar name
    access_token TEXT, -- OAuth access token (encrypted in production)
    refresh_token TEXT, -- OAuth refresh token (encrypted in production)
    ical_url TEXT, -- For iCal subscription URLs
    sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK (sync_direction IN ('app_to_calendar', 'calendar_to_app', 'bidirectional')),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_error TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_calendar_syncs_provider ON calendar_syncs(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_syncs_active ON calendar_syncs(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_calendar_syncs_provider_type ON calendar_syncs(provider_id, provider);

-- Create trigger for updated_at
CREATE TRIGGER update_calendar_syncs_updated_at 
    BEFORE UPDATE ON calendar_syncs
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE calendar_syncs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_syncs
CREATE POLICY "Providers can manage own calendar syncs"
    ON calendar_syncs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = calendar_syncs.provider_id
            AND (
                providers.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.is_active = true
                )
            )
        )
    );

-- Add comment
COMMENT ON TABLE calendar_syncs IS 'Stores calendar integration syncs for providers (Google Calendar, Outlook, iCal)';
COMMENT ON COLUMN calendar_syncs.sync_direction IS 'Direction of sync: app_to_calendar (push appointments to calendar), calendar_to_app (pull events from calendar), bidirectional (both)';
