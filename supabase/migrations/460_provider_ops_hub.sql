-- Provider Ops Hub: lead management, onboarding tracking, assisted onboarding
-- Creates tables for the internal admin supply operations feature

-- ============================================================================
-- 1. provider_leads — pre-signup lead records
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  lead_name TEXT,
  business_name TEXT,
  contact_person_name TEXT,
  email TEXT,
  phone_country_code TEXT,
  phone_national TEXT,
  phone_e164 TEXT,

  suggested_location_text TEXT,
  resolved_location JSONB,
  location_confidence TEXT CHECK (location_confidence IS NULL OR location_confidence IN ('high','medium','low','none')),
  country TEXT,

  description TEXT,
  notes TEXT,

  commercial_stage TEXT NOT NULL DEFAULT 'new'
    CHECK (commercial_stage IN (
      'new','contacted','qualified','proposal_sent',
      'negotiating','won','lost','nurture','matched'
    )),
  lost_reason TEXT,
  is_dormant BOOLEAN NOT NULL DEFAULT false,
  reopen_count INTEGER NOT NULL DEFAULT 0,

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','import','referral','campaign','outbound','api','form')),
  source_detail TEXT,
  campaign_id TEXT,
  referrer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referrer_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,

  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',

  matched_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  matched_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  match_confidence NUMERIC(3,2),
  matched_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_leads_tenant_stage ON provider_leads(tenant_id, commercial_stage);
CREATE INDEX idx_provider_leads_phone ON provider_leads(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX idx_provider_leads_email ON provider_leads(email) WHERE email IS NOT NULL;
CREATE INDEX idx_provider_leads_business_name ON provider_leads(tenant_id, lower(business_name)) WHERE business_name IS NOT NULL;
CREATE INDEX idx_provider_leads_assigned ON provider_leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_provider_leads_matched ON provider_leads(matched_provider_id) WHERE matched_provider_id IS NOT NULL;
CREATE INDEX idx_provider_leads_source ON provider_leads(tenant_id, source);

ALTER TABLE provider_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_leads"
  ON provider_leads FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support','admin_marketing')
  ));

CREATE TRIGGER update_provider_leads_updated_at
  BEFORE UPDATE ON provider_leads FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. provider_lead_categories — lead-to-global-category junction
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_lead_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES provider_leads(id) ON DELETE CASCADE,
  global_category_id UUID NOT NULL REFERENCES global_service_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id, global_category_id)
);

CREATE INDEX idx_provider_lead_categories_lead ON provider_lead_categories(lead_id);

ALTER TABLE provider_lead_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_lead_categories"
  ON provider_lead_categories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support','admin_marketing')
  ));

-- ============================================================================
-- 3. provider_lead_activities — timeline / audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES provider_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_lead_activities_lead ON provider_lead_activities(lead_id, created_at DESC);

ALTER TABLE provider_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_lead_activities"
  ON provider_lead_activities FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support','admin_marketing')
  ));

-- ============================================================================
-- 4. provider_lead_communications — communication log
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_lead_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp','email','call','push','internal_note')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  from_number TEXT,
  to_number TEXT,
  subject TEXT,
  body TEXT,
  template_id TEXT,
  external_message_id TEXT,
  status TEXT DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_lead_comms_lead ON provider_lead_communications(lead_id, created_at DESC);
CREATE INDEX idx_provider_lead_comms_provider ON provider_lead_communications(provider_id, created_at DESC);
CREATE INDEX idx_provider_lead_comms_user ON provider_lead_communications(user_id, created_at DESC);

ALTER TABLE provider_lead_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_lead_communications"
  ON provider_lead_communications FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support','admin_marketing')
  ));

-- ============================================================================
-- 5. provider_lead_tasks — follow-up tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES provider_leads(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'follow_up',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_lead_tasks_due ON provider_lead_tasks(due_at) WHERE completed_at IS NULL;
CREATE INDEX idx_provider_lead_tasks_lead ON provider_lead_tasks(lead_id);

ALTER TABLE provider_lead_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_lead_tasks"
  ON provider_lead_tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support')
  ));

-- ============================================================================
-- 6. provider_onboarding_tracking — track every signup through the wizard
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_onboarding_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  wizard_status TEXT NOT NULL DEFAULT 'signed_up'
    CHECK (wizard_status IN ('signed_up','in_progress','stalled','dropped_off','submitted','completed')),
  current_step INTEGER,
  current_step_name TEXT,

  steps_completed INTEGER[] DEFAULT '{}',
  step_timestamps JSONB DEFAULT '{}',

  last_progress_at TIMESTAMPTZ DEFAULT NOW(),
  stall_notified_at TIMESTAMPTZ,
  drop_off_notified_at TIMESTAMPTZ,

  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_assisted BOOLEAN NOT NULL DEFAULT false,
  admin_completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_completed_at TIMESTAMPTZ,
  admin_notes TEXT,

  lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,

  signup_source TEXT,
  signup_referrer TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX idx_onboarding_tracking_tenant_status ON provider_onboarding_tracking(tenant_id, wizard_status);
CREATE INDEX idx_onboarding_tracking_stalled ON provider_onboarding_tracking(last_progress_at)
  WHERE wizard_status IN ('in_progress','stalled');
CREATE INDEX idx_onboarding_tracking_assigned ON provider_onboarding_tracking(assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_onboarding_tracking_user ON provider_onboarding_tracking(user_id);

ALTER TABLE provider_onboarding_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_onboarding_tracking"
  ON provider_onboarding_tracking FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support')
  ));

CREATE TRIGGER update_provider_onboarding_tracking_updated_at
  BEFORE UPDATE ON provider_onboarding_tracking FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. Modify providers table — add onboarding_state and lead_id
-- ============================================================================

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'not_started'
    CHECK (onboarding_state IS NULL OR onboarding_state IN (
      'not_started','profile_incomplete','documents_pending',
      'verification_in_review','verification_rejected',
      'ready_for_activation','activated'
    ));

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL;

-- ============================================================================
-- 8. Admin RLS policies on provider_onboarding_drafts
-- ============================================================================

CREATE POLICY "Admins can read onboarding drafts"
  ON provider_onboarding_drafts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations','admin_support')
  ));

CREATE POLICY "Admins can update onboarding drafts"
  ON provider_onboarding_drafts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations')
  ));

CREATE POLICY "Admins can create onboarding drafts"
  ON provider_onboarding_drafts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role IN ('superadmin','admin_operations')
  ));

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE provider_leads IS 'Pre-signup lead records for potential providers. Part of Provider Ops Hub.';
COMMENT ON TABLE provider_lead_categories IS 'Junction table linking leads to global service categories.';
COMMENT ON TABLE provider_lead_activities IS 'Immutable activity/audit log for lead lifecycle events.';
COMMENT ON TABLE provider_lead_communications IS 'Communication log for leads and providers (SMS, WhatsApp, email, call).';
COMMENT ON TABLE provider_lead_tasks IS 'Follow-up tasks for leads and providers.';
COMMENT ON TABLE provider_onboarding_tracking IS 'Tracks every provider signup through the onboarding wizard. Core of the ops hub tracker.';
COMMENT ON COLUMN providers.onboarding_state IS 'Post-submission onboarding progress state.';
COMMENT ON COLUMN providers.lead_id IS 'Backlink to the originating lead record if this provider was captured as a lead first.';
