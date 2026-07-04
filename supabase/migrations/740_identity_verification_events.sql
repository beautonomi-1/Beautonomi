-- Migration 740: Identity verification events (webhook event log)
--
-- Immutable append-only log of every webhook event received from Didit.
-- Idempotency is enforced by the unique constraint on event_id.

CREATE TABLE IF NOT EXISTS identity_verification_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        UUID NOT NULL REFERENCES identity_verification_sessions(id) ON DELETE CASCADE,

  -- Didit event id — unique, used for idempotency deduplication
  event_id          TEXT NOT NULL,

  webhook_type      TEXT,                  -- e.g. "verification_update"
  status            TEXT,                  -- raw Didit status string
  signature_variant TEXT,                  -- 'v2', 'raw', 'simple'

  -- PII-minimised sanitised payload (no document numbers/DOB/names/images)
  raw_payload       JSONB DEFAULT '{}'::jsonb,

  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: one row per Didit event_id globally
CREATE UNIQUE INDEX IF NOT EXISTS idx_ive_event_id ON identity_verification_events(event_id);

CREATE INDEX IF NOT EXISTS idx_ive_session_id  ON identity_verification_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ive_received_at ON identity_verification_events(received_at);

ALTER TABLE identity_verification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all verification events"
  ON identity_verification_events FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own verification events"
  ON identity_verification_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM identity_verification_sessions s
      WHERE s.id = identity_verification_events.session_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM providers p
            WHERE p.id = s.provider_id AND p.user_id = auth.uid()
          )
        )
    )
  );

COMMENT ON TABLE identity_verification_events IS
  'Append-only webhook event log from Didit. Idempotent on event_id. PII-minimised.';
COMMENT ON COLUMN identity_verification_events.event_id IS
  'Didit event id — unique globally for idempotency; re-delivered webhooks are no-ops.';
