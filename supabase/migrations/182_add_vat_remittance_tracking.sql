-- ============================================================================
-- Migration 182: Add VAT Remittance Tracking
-- ============================================================================
-- Adds field to track when provider confirms they've remitted VAT to SARS
-- ============================================================================

-- Add remitted_to_sars field to vat_remittance_reminders table
ALTER TABLE vat_remittance_reminders
ADD COLUMN IF NOT EXISTS remitted_to_sars BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS remitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS remitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS remittance_notes TEXT;

-- Add index for remittance status
CREATE INDEX IF NOT EXISTS idx_vat_reminders_remitted 
  ON vat_remittance_reminders(provider_id, remitted_to_sars, deadline_date);

-- Add comments
COMMENT ON COLUMN vat_remittance_reminders.remitted_to_sars IS 'Whether the provider has confirmed remittance to SARS';
COMMENT ON COLUMN vat_remittance_reminders.remitted_at IS 'Timestamp when provider confirmed remittance';
COMMENT ON COLUMN vat_remittance_reminders.remitted_by IS 'User ID who marked as remitted (typically provider owner)';
COMMENT ON COLUMN vat_remittance_reminders.remittance_notes IS 'Optional notes about the remittance';
