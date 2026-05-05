-- Rich announcement metadata for admin broadcasts (images, CTAs, promotion expiry).
ALTER TABLE broadcast_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN broadcast_logs.metadata IS
  'Structured rich content: announcement_type, media_url, media_type, cta_label, cta_url, expires_at (ISO UTC)';
