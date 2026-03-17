-- Maintenance / coming-soon "notify me" sign-ups.
-- Used by the maintenance page CTA; admin can export or use for "notify when we're back".

CREATE TABLE IF NOT EXISTS maintenance_notify_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('public_site', 'provider_web', 'customer_app', 'provider_app')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_notify_emails_scope_created
  ON maintenance_notify_emails (scope, created_at DESC);

ALTER TABLE maintenance_notify_emails ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit (public maintenance page); no auth required.
CREATE POLICY "Allow anon insert for maintenance notify"
  ON maintenance_notify_emails FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only service role / admin should read (e.g. export). No public read.
CREATE POLICY "Service role can read maintenance notify"
  ON maintenance_notify_emails FOR SELECT
  TO service_role
  USING (true);

-- Optional: allow superadmin to read via authenticated role if your app uses a role check
-- Here we keep it simple: API uses service role for reads, anon for inserts.
COMMENT ON TABLE maintenance_notify_emails IS 'Emails collected from maintenance/coming-soon page "Notify me" CTA.';
