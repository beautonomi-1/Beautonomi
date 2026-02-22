-- Beautonomi Database Migration
-- 016_platform_secrets.sql
-- Store sensitive platform keys securely (NOT in public platform_settings JSON)

CREATE TABLE IF NOT EXISTS platform_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paystack_secret_key TEXT,
  paystack_public_key TEXT,
  paystack_webhook_secret TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Singleton row pattern: allow only one row (optional, but helpful)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_secrets_singleton ON platform_secrets ((1));

CREATE TRIGGER update_platform_secrets_updated_at BEFORE UPDATE ON platform_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE platform_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage platform secrets"
  ON platform_secrets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

