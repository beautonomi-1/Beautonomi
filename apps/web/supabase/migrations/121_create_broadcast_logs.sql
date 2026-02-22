-- Create broadcast_logs table for tracking admin broadcasts
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all_users', 'all_providers', 'custom')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  notification_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_sent_by ON broadcast_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_channel ON broadcast_logs(channel);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_created_at ON broadcast_logs(created_at DESC);

-- Enable RLS
ALTER TABLE broadcast_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only superadmins can view all broadcasts
CREATE POLICY "Superadmins can view all broadcast logs"
  ON broadcast_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- RLS Policies: Only superadmins can insert broadcast logs
CREATE POLICY "Superadmins can insert broadcast logs"
  ON broadcast_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );
