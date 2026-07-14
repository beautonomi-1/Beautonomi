-- Provider Ops lead enhancements: soft-delete, do-not-contact, phone lookup quality

ALTER TABLE provider_leads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT,
  ADD COLUMN IF NOT EXISTS phone_lookup_status TEXT,
  ADD COLUMN IF NOT EXISTS phone_line_type TEXT,
  ADD COLUMN IF NOT EXISTS phone_lookup_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_provider_leads_active_tenant
  ON provider_leads(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_leads_deleted_tenant
  ON provider_leads(tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN provider_leads.deleted_at IS 'Soft-delete timestamp; NULL = active lead.';
COMMENT ON COLUMN provider_leads.do_not_contact IS 'Lead opted out or admin-marked do-not-contact; blocks outbound comms.';
COMMENT ON COLUMN provider_leads.phone_lookup_status IS 'Twilio Lookup result: valid, invalid, unknown.';
COMMENT ON COLUMN provider_leads.phone_line_type IS 'Twilio Lookup line type: mobile, landline, voip, etc.';
