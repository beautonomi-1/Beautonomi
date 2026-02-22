-- Create amplitude_integration_config table
CREATE TABLE IF NOT EXISTS amplitude_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- API Keys (encrypted at rest via Supabase Vault or env vars)
  api_key_public TEXT NOT NULL, -- Public API key (safe for browser)
  api_key_server TEXT, -- Server secret key (optional, for HTTP API)
  ingestion_endpoint TEXT DEFAULT 'https://api2.amplitude.com/2/httpapi',
  
  -- Environment
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  
  -- Portal Toggles
  enabled_client_portal BOOLEAN DEFAULT true,
  enabled_provider_portal BOOLEAN DEFAULT true,
  enabled_admin_portal BOOLEAN DEFAULT true,
  
  -- Guides & Surveys
  guides_enabled BOOLEAN DEFAULT false,
  surveys_enabled BOOLEAN DEFAULT false,
  
  -- Configuration
  sampling_rate NUMERIC(3, 2) DEFAULT 1.00 CHECK (sampling_rate >= 0 AND sampling_rate <= 1), -- 0.00 to 1.00
  debug_mode BOOLEAN DEFAULT false,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Only one active config per environment
  UNIQUE(environment)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_amplitude_integration_config_environment ON amplitude_integration_config(environment);

-- Enable RLS
ALTER TABLE amplitude_integration_config ENABLE ROW LEVEL SECURITY;

-- RLS: Superadmin only
CREATE POLICY "Superadmins can manage amplitude config"
  ON amplitude_integration_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_amplitude_integration_config_updated_at
  BEFORE UPDATE ON amplitude_integration_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
