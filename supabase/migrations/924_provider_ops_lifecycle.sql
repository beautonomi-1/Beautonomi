-- Provider Ops lifecycle: cases, handoffs, quotas, lead SLA fields
-- Desk roles (admin_sales, admin_onboarding, admin_retention) are added in
-- 923_provider_ops_desk_roles_enum.sql (must run in the same deploy batch, earlier filename).

-- 1. Lead ops columns
ALTER TABLE provider_leads
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(12, 2);

COMMENT ON COLUMN provider_leads.next_follow_up_at IS 'Rep-scheduled follow-up; Slack SLA prefers this over updated_at when set.';
COMMENT ON COLUMN provider_leads.deal_value IS 'Optional pipeline value for ops reporting and high-value Slack alerts.';

-- 2. Market waitlist → lead link
ALTER TABLE city_waitlist
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_city_waitlist_lead ON city_waitlist(lead_id) WHERE lead_id IS NOT NULL;

-- 3. Cases
CREATE TABLE IF NOT EXISTS provider_ops_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  current_desk TEXT NOT NULL DEFAULT 'sales'
    CHECK (current_desk IN ('sales', 'onboarding', 'retention')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'lost', 'nurture', 'activated', 'churned')),
  sales_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  onboarding_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  retention_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_contacted_at TIMESTAMPTZ,
  won_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  first_booking_at TIMESTAMPTZ,
  deal_value NUMERIC(12, 2),
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_ops_cases_lead_open
  ON provider_ops_cases(lead_id) WHERE lead_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_ops_cases_provider_open
  ON provider_ops_cases(provider_id) WHERE provider_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_ops_cases_user_open
  ON provider_ops_cases(user_id) WHERE user_id IS NOT NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_provider_ops_cases_tenant_desk
  ON provider_ops_cases(tenant_id, current_desk, status);
CREATE INDEX IF NOT EXISTS idx_provider_ops_cases_sales_owner
  ON provider_ops_cases(sales_owner_id) WHERE sales_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_ops_cases_onboarding_owner
  ON provider_ops_cases(onboarding_owner_id) WHERE onboarding_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_ops_cases_retention_owner
  ON provider_ops_cases(retention_owner_id) WHERE retention_owner_id IS NOT NULL;

ALTER TABLE provider_ops_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_ops_cases"
  ON provider_ops_cases FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role::text IN (
      'superadmin','admin_operations','admin_support','admin_marketing',
      'admin_sales','admin_onboarding','admin_retention'
    )
  ));

CREATE TRIGGER update_provider_ops_cases_updated_at
  BEFORE UPDATE ON provider_ops_cases FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Handoffs
CREATE TABLE IF NOT EXISTS provider_ops_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES provider_ops_cases(id) ON DELETE CASCADE,
  from_desk TEXT NOT NULL CHECK (from_desk IN ('sales', 'onboarding', 'retention')),
  to_desk TEXT NOT NULL CHECK (to_desk IN ('sales', 'onboarding', 'retention')),
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'auto_accepted', 'rejected')),
  note TEXT,
  sla_due_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_ops_handoffs_case
  ON provider_ops_handoffs(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_ops_handoffs_pending_to
  ON provider_ops_handoffs(to_user_id, status) WHERE status = 'pending';

ALTER TABLE provider_ops_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_ops_handoffs"
  ON provider_ops_handoffs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role::text IN (
      'superadmin','admin_operations','admin_support','admin_marketing',
      'admin_sales','admin_onboarding','admin_retention'
    )
  ));

CREATE TRIGGER update_provider_ops_handoffs_updated_at
  BEFORE UPDATE ON provider_ops_handoffs FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Quotas
CREATE TABLE IF NOT EXISTS provider_ops_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  desk TEXT NOT NULL CHECK (desk IN ('sales', 'onboarding', 'retention')),
  period_start DATE NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'leads_contacted', 'leads_won', 'providers_activated', 'first_bookings', 'at_risk_saves'
  )),
  target INTEGER NOT NULL CHECK (target >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, desk, period_start, metric)
);

ALTER TABLE provider_ops_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_ops_quotas"
  ON provider_ops_quotas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin', 'admin_operations', 'admin_support')
  ));

-- 6. Backfill cases from open leads
INSERT INTO provider_ops_cases (
  tenant_id, lead_id, current_desk, status, sales_owner_id, matched_at, lost_reason, deal_value
)
SELECT
  pl.tenant_id,
  pl.id,
  CASE
    WHEN pl.commercial_stage IN ('lost') THEN 'sales'
    WHEN pl.commercial_stage IN ('nurture') THEN 'sales'
    WHEN pl.commercial_stage = 'matched' THEN 'onboarding'
    ELSE 'sales'
  END,
  CASE
    WHEN pl.commercial_stage = 'lost' THEN 'lost'
    WHEN pl.commercial_stage = 'nurture' THEN 'nurture'
    ELSE 'open'
  END,
  pl.assigned_to,
  pl.matched_at,
  pl.lost_reason,
  pl.deal_value
FROM provider_leads pl
WHERE pl.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM provider_ops_cases c
    WHERE c.lead_id = pl.id AND c.status = 'open'
  );

-- 7. Backfill cases from providers without a lead-linked open case
INSERT INTO provider_ops_cases (
  tenant_id, provider_id, user_id, lead_id, current_desk, status,
  onboarding_owner_id, activated_at
)
SELECT
  p.tenant_id,
  p.id,
  p.user_id,
  p.lead_id,
  CASE
    WHEN p.status IN ('draft', 'pending_approval') THEN 'onboarding'
    WHEN p.status = 'active' THEN 'retention'
    WHEN p.status = 'suspended' THEN 'retention'
    ELSE 'onboarding'
  END,
  CASE
    WHEN p.status = 'suspended' THEN 'churned'
    WHEN p.status = 'active' THEN 'activated'
    ELSE 'open'
  END,
  t.assigned_to,
  CASE WHEN p.status = 'active' THEN p.updated_at ELSE NULL END
FROM providers p
LEFT JOIN provider_onboarding_tracking t ON t.user_id = p.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM provider_ops_cases c
  WHERE c.provider_id = p.id AND c.status IN ('open', 'activated')
)
AND NOT EXISTS (
  SELECT 1 FROM provider_ops_cases c
  WHERE c.lead_id = p.lead_id AND p.lead_id IS NOT NULL AND c.status = 'open'
);

COMMENT ON TABLE provider_ops_cases IS 'Single spine record for provider acquisition → onboarding → retention ownership.';
COMMENT ON TABLE provider_ops_handoffs IS 'Desk transitions with optional accept/reject workflow.';
COMMENT ON TABLE provider_ops_quotas IS 'Per-rep monthly targets by desk and metric.';
