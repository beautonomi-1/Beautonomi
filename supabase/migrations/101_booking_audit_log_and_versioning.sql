-- Migration: Add booking audit log and versioning for conflict detection
-- This migration adds:
-- 1. Version column to bookings table for optimistic locking
-- 2. booking_audit_log table for comprehensive audit logging

-- Add version column to bookings table for conflict detection
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Create index on version for faster conflict checks
CREATE INDEX IF NOT EXISTS idx_bookings_version ON bookings(version);

-- Create booking_audit_log table for comprehensive audit logging
CREATE TABLE IF NOT EXISTS booking_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT booking_audit_log_event_type_check 
    CHECK (event_type IN (
      'created', 'confirmed', 'service_started', 'service_completed', 
      'cancelled', 'status_changed', 'payment_received', 'refunded', 
      'rescheduled', 'note_added', 'deleted', 'updated'
    ))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_booking_audit_log_booking_id ON booking_audit_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_audit_log_created_at ON booking_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_audit_log_event_type ON booking_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_booking_audit_log_created_by ON booking_audit_log(created_by);

-- Add RLS policies
ALTER TABLE booking_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can view audit logs for their bookings
CREATE POLICY "Providers can view audit logs for their bookings"
  ON booking_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_audit_log.booking_id
      AND bookings.provider_id IN (
        SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        UNION
        SELECT id FROM providers WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: System can insert audit log entries
CREATE POLICY "System can insert audit log entries"
  ON booking_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Function to automatically increment version on booking updates
CREATE OR REPLACE FUNCTION increment_booking_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment version on updates (if not already set)
CREATE TRIGGER booking_version_increment
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.version = OLD.version)
  EXECUTE FUNCTION increment_booking_version();

-- Function to create audit log entry when booking status changes
CREATE OR REPLACE FUNCTION log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO booking_audit_log (
      booking_id,
      event_type,
      event_data,
      created_by,
      created_by_name
    ) VALUES (
      NEW.id,
      CASE 
        WHEN NEW.status = 'confirmed' THEN 'confirmed'
        WHEN NEW.status = 'in_progress' THEN 'service_started'
        WHEN NEW.status = 'completed' THEN 'service_completed'
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        ELSE 'status_changed'
      END,
      jsonb_build_object(
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'field', 'status',
        'old_value', OLD.status,
        'new_value', NEW.status
      ),
      COALESCE(
        (SELECT id FROM users WHERE id = auth.uid()),
        '00000000-0000-0000-0000-000000000000'::UUID
      ),
      COALESCE(
        (SELECT full_name FROM users WHERE id = auth.uid()),
        'System'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create audit log on status changes
CREATE TRIGGER booking_status_change_audit
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_booking_status_change();

-- Add comment to table
COMMENT ON TABLE booking_audit_log IS 'Comprehensive audit log for all booking changes including status updates, payments, and modifications';
COMMENT ON COLUMN bookings.version IS 'Version number for optimistic locking to prevent conflicts when multiple users edit the same booking';
