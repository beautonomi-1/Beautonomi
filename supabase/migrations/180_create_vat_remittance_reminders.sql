-- ============================================================================
-- Migration 180: Create VAT Remittance Reminders System
-- ============================================================================
-- This migration creates the database schema for VAT remittance reminders
-- and notification preferences for VAT-registered providers.
-- ============================================================================

-- Create VAT remittance reminders table
CREATE TABLE IF NOT EXISTS vat_remittance_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  deadline_date DATE NOT NULL,
  days_before_deadline INTEGER NOT NULL, -- e.g., 14, 7, 3, 1
  vat_amount NUMERIC(10, 2) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notification_channels TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['email', 'sms', 'push']
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, period_start, period_end, days_before_deadline)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vat_reminders_provider 
  ON vat_remittance_reminders(provider_id);
  
CREATE INDEX IF NOT EXISTS idx_vat_reminders_deadline 
  ON vat_remittance_reminders(deadline_date);
  
CREATE INDEX IF NOT EXISTS idx_vat_reminders_period 
  ON vat_remittance_reminders(period_start, period_end);

-- Add VAT reminder preferences to notification_preferences table
-- (If table doesn't exist, this will be handled by the notification preferences migration)
DO $$
BEGIN
  -- Check if notification_preferences table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
    -- Add VAT reminder preference columns if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'notification_preferences' 
      AND column_name = 'vat_reminders_email'
    ) THEN
      ALTER TABLE notification_preferences
        ADD COLUMN vat_reminders_email BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'notification_preferences' 
      AND column_name = 'vat_reminders_sms'
    ) THEN
      ALTER TABLE notification_preferences
        ADD COLUMN vat_reminders_sms BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'notification_preferences' 
      AND column_name = 'vat_reminders_push'
    ) THEN
      ALTER TABLE notification_preferences
        ADD COLUMN vat_reminders_push BOOLEAN DEFAULT false;
    END IF;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE vat_remittance_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Providers can view own VAT reminders"
  ON vat_remittance_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = vat_remittance_reminders.provider_id
      AND providers.user_id = auth.uid()
    )
  );

CREATE POLICY "Superadmins can manage all VAT reminders"
  ON vat_remittance_reminders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Add comments
COMMENT ON TABLE vat_remittance_reminders IS 'Tracks VAT remittance reminders sent to providers';
COMMENT ON COLUMN vat_remittance_reminders.period_start IS 'Start date of VAT collection period (bi-monthly)';
COMMENT ON COLUMN vat_remittance_reminders.period_end IS 'End date of VAT collection period (bi-monthly)';
COMMENT ON COLUMN vat_remittance_reminders.deadline_date IS 'SARS remittance deadline (typically 25th of month after period)';
COMMENT ON COLUMN vat_remittance_reminders.days_before_deadline IS 'Days before deadline when reminder was sent (14, 7, 3, or 1)';
COMMENT ON COLUMN vat_remittance_reminders.vat_amount IS 'Total VAT collected in the period (ZAR)';
COMMENT ON COLUMN vat_remittance_reminders.notification_channels IS 'Channels used to send reminder (email, sms, push)';
