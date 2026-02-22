-- Create error_logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  request_data JSONB,
  stack_trace TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for error_logs
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_endpoint ON error_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_error_logs_provider_id ON error_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- Create api_health_checks table
CREATE TABLE IF NOT EXISTS api_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  response_time_ms INTEGER NOT NULL,
  status_code INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for api_health_checks
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON api_health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_endpoint_method ON api_health_checks(endpoint, method);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON api_health_checks(status);

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_health_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for error_logs - only superadmin can read
CREATE POLICY "Superadmin can view all error logs"
  ON error_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- RLS Policies for api_health_checks - only superadmin can read
CREATE POLICY "Superadmin can view all health checks"
  ON api_health_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Allow service role to insert (for logging)
CREATE POLICY "Service role can insert error logs"
  ON error_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can insert health checks"
  ON api_health_checks FOR INSERT
  WITH CHECK (true);

-- Create function to clean up old logs (optional - for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Delete error logs older than 90 days
  DELETE FROM error_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Delete health checks older than 30 days
  DELETE FROM api_health_checks
  WHERE checked_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
