-- Migration 739: Identity verification sessions (Didit)
--
-- Provider-neutral session table that is the new source of truth for all
-- identity-verification activity.  Legacy Sumsub rows in user_verifications /
-- provider_verification_status are kept read-only (see 742).
--
-- One active (non-terminal) session per entity is enforced by a partial
-- unique index so cross-channel resume always reuses the same session.

CREATE TYPE identity_verification_status AS ENUM (
  'not_started',
  'session_created',
  'in_progress',
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'abandoned',
  'requires_retry',
  'errored'
);

CREATE TYPE identity_verification_persona AS ENUM (
  'customer',
  'provider'
);

CREATE TABLE IF NOT EXISTS identity_verification_sessions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Entity
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id          UUID REFERENCES providers(id) ON DELETE SET NULL,
  persona_type         identity_verification_persona NOT NULL,
  tenant_id            UUID REFERENCES tenants(id) ON DELETE SET NULL,

  -- Provider info
  provider             TEXT NOT NULL DEFAULT 'didit',
  provider_session_id  TEXT UNIQUE,          -- Didit session id
  workflow_id          TEXT,

  -- Status
  status               identity_verification_status NOT NULL DEFAULT 'not_started',
  rejection_reason     TEXT,
  risk_flags           JSONB DEFAULT '{}'::jsonb,

  -- Correlation
  vendor_data          TEXT,                 -- e.g. "user:{userId}"
  metadata             JSONB DEFAULT '{}'::jsonb,

  -- PII-minimised decision snapshot (no document numbers / images)
  decision             JSONB DEFAULT '{}'::jsonb,

  -- Data-accuracy flags (populated by webhook handler)
  name_mismatch_flag   BOOLEAN DEFAULT false,
  identity_dedupe_flag BOOLEAN DEFAULT false,
  under_age_flag       BOOLEAN DEFAULT false,

  -- Timing / accuracy
  last_event_at        TIMESTAMPTZ,          -- monotonicity guard
  webhook_received_at  TIMESTAMPTZ,
  last_checked_at      TIMESTAMPTZ,          -- reconciliation
  expires_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-active-session invariant: at most one non-terminal session per customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivs_one_active_customer
  ON identity_verification_sessions (user_id)
  WHERE persona_type = 'customer'
    AND status NOT IN ('approved','rejected','expired','abandoned','errored');

-- One-active-session invariant: at most one non-terminal session per provider.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivs_one_active_provider
  ON identity_verification_sessions (provider_id)
  WHERE persona_type = 'provider'
    AND provider_id IS NOT NULL
    AND status NOT IN ('approved','rejected','expired','abandoned','errored');

-- General lookup indexes
CREATE INDEX IF NOT EXISTS idx_ivs_user_id    ON identity_verification_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ivs_provider_id ON identity_verification_sessions(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ivs_status     ON identity_verification_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ivs_tenant_id  ON identity_verification_sessions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ivs_provider_session_id ON identity_verification_sessions(provider_session_id) WHERE provider_session_id IS NOT NULL;
-- Reconciliation: non-terminal sessions not recently checked
CREATE INDEX IF NOT EXISTS idx_ivs_reconcile
  ON identity_verification_sessions(last_checked_at NULLS FIRST)
  WHERE status NOT IN ('approved','rejected','expired','abandoned','errored');

CREATE TRIGGER update_identity_verification_sessions_updated_at
  BEFORE UPDATE ON identity_verification_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE identity_verification_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verification sessions"
  ON identity_verification_sessions FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = identity_verification_sessions.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all verification sessions"
  ON identity_verification_sessions FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE identity_verification_sessions IS
  'Provider-neutral identity-verification sessions (Didit). Source of truth for all KYC activity. Legacy Sumsub rows live in user_verifications (document_type=sumsub) as read-only history.';
