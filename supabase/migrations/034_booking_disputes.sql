-- Beautonomi Database Migration
-- 034_booking_disputes.sql
-- Adds booking disputes table used by admin dispute routes.

CREATE TABLE IF NOT EXISTS booking_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  opened_by TEXT NOT NULL CHECK (opened_by IN ('customer', 'provider', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'closed')) DEFAULT 'open',
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution TEXT CHECK (resolution IN ('refund_full', 'refund_partial', 'deny')),
  refund_amount NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_disputes_booking ON booking_disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_disputes_status ON booking_disputes(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_disputes_open_one_per_booking
  ON booking_disputes(booking_id) WHERE status = 'open';

CREATE TRIGGER update_booking_disputes_updated_at BEFORE UPDATE ON booking_disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE booking_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage disputes"
  ON booking_disputes FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE POLICY "Users can view disputes for their bookings"
  ON booking_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_disputes.booking_id
      AND (
        b.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM providers p
          WHERE p.id = b.provider_id
          AND (
            p.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM provider_staff ps
              WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
            )
          )
        )
      )
    )
  );

