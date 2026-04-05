-- When bookings are updated with the service role (no auth.uid()), status-change audit rows
-- used COALESCE(..., '00000000-0000-0000-0000-000000000000') which is not a real users.id
-- and violates booking_audit_log_created_by_fkey (e.g. release slot after Paystack init fails).
CREATE OR REPLACE FUNCTION log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
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
        NEW.cancelled_by,
        NEW.customer_id
      ),
      COALESCE(
        (SELECT full_name FROM users WHERE id = auth.uid()),
        (SELECT full_name FROM users WHERE id = NEW.cancelled_by),
        (SELECT full_name FROM users WHERE id = NEW.customer_id),
        'System'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
