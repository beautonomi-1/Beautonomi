-- Create report_schedules table
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  time TIME NOT NULL DEFAULT '09:00:00',
  recipients TEXT[] NOT NULL,
  format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'pdf')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_report_schedules_provider_id ON report_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_is_active ON report_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at ON report_schedules(next_run_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_report_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_report_schedules_updated_at();

-- RLS Policies
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can only see their own report schedules
CREATE POLICY "Providers can view their own report schedules"
  ON report_schedules
  FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

-- Policy: Providers can insert their own report schedules
CREATE POLICY "Providers can create their own report schedules"
  ON report_schedules
  FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: Providers can update their own report schedules
CREATE POLICY "Providers can update their own report schedules"
  ON report_schedules
  FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

-- Policy: Providers can delete their own report schedules
CREATE POLICY "Providers can delete their own report schedules"
  ON report_schedules
  FOR DELETE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );
