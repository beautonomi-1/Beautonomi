-- Financial period locks: prevent backdated writes to closed accounting periods.
CREATE TABLE IF NOT EXISTS financial_period_locks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  period_start DATE       NOT NULL,
  period_end   DATE       NOT NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT period_end_after_start CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_fpl_tenant
  ON financial_period_locks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_fpl_range
  ON financial_period_locks(tenant_id, period_start, period_end);

ALTER TABLE financial_period_locks ENABLE ROW LEVEL SECURITY;

-- Admin API uses service-role client (getSupabaseAdmin) which bypasses RLS.
-- Fallback policy: allow authenticated reads so dashboard queries work if
-- a future path uses a user-scoped client.
CREATE POLICY "Authenticated users can read period locks"
  ON financial_period_locks FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access on financial_period_locks"
  ON financial_period_locks FOR ALL
  USING (true)
  WITH CHECK (true);
