-- Create webhook_endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255),
  events TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  headers JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- webhook_events table already exists from migration 014
-- Add new columns for webhook endpoints feature if they don't exist
DO $$ 
BEGIN
  -- Add endpoint_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'endpoint_id'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN endpoint_id UUID REFERENCES webhook_endpoints(id) ON DELETE CASCADE;
  END IF;

  -- Add response_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'response_status'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN response_status INTEGER;
  END IF;

  -- Add response_body column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'response_body'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN response_body TEXT;
  END IF;

  -- Add attempt_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN attempt_count INTEGER DEFAULT 0;
  END IF;

  -- Add sent_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN sent_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add next_retry_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE webhook_events 
    ADD COLUMN next_retry_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_is_active ON webhook_endpoints(is_active);

-- Create indexes on webhook_events (only if columns exist)
DO $$ 
BEGIN
  -- Index on endpoint_id (only if column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'endpoint_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_webhook_events_endpoint_id ON webhook_events(endpoint_id);
  END IF;

  -- Index on status (may already exist from migration 014)
  CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
  
  -- Index on created_at (may already exist from migration 014)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'webhook_events' 
    AND indexname = 'idx_webhook_events_created_at'
  ) THEN
    CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);
  END IF;

  -- Index on event_type (may already exist from migration 014)
  CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
END $$;

-- Enable RLS
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
-- webhook_events RLS is already enabled in migration 094

-- RLS Policies
CREATE POLICY "Superadmins can manage webhook endpoints"
  ON webhook_endpoints FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Note: webhook_events RLS policies already exist in migration 094
-- The existing policy allows superadmins to view webhook events
-- No need to create duplicate policies

-- Trigger to update updated_at timestamp
-- Uses the generic update_updated_at_column() function if available (created in migration 092)
-- Otherwise creates a specific function for this table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_webhook_endpoints_updated_at
      BEFORE UPDATE ON webhook_endpoints
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  ELSE
    -- Fallback: create specific function if generic doesn't exist
    CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
    RETURNS TRIGGER AS $function$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $function$ LANGUAGE plpgsql;
    
    CREATE TRIGGER update_webhook_endpoints_updated_at
      BEFORE UPDATE ON webhook_endpoints
      FOR EACH ROW
      EXECUTE FUNCTION update_webhook_endpoints_updated_at();
  END IF;
END $$;
