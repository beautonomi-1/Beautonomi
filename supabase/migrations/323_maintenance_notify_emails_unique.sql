-- One sign-up per (email, scope). Case-insensitive email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_notify_emails_email_scope
  ON maintenance_notify_emails (lower(email), scope);
