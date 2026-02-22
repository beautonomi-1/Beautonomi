-- Migration 230: Add RLS policies to financial tables
-- These tables were identified as potentially lacking RLS in the security audit
-- Uses actual table names from the schema: payment_transactions, finance_transactions,
-- booking_payments, payments, webhook_events, payment_methods, payouts, provider_invoices

-- ============================================================================
-- 1. payment_transactions — Paystack payment records (migration 014)
-- ============================================================================
ALTER TABLE IF EXISTS payment_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_transactions' AND policyname = 'Customers can view own payment transactions'
  ) THEN
    CREATE POLICY "Customers can view own payment transactions" ON payment_transactions
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = payment_transactions.booking_id
          AND b.customer_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_transactions' AND policyname = 'Providers can view own payment transactions'
  ) THEN
    CREATE POLICY "Providers can view own payment transactions" ON payment_transactions
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM bookings b
          JOIN providers p ON p.id = b.provider_id
          WHERE b.id = payment_transactions.booking_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_transactions' AND policyname = 'Service role full access payment_transactions'
  ) THEN
    CREATE POLICY "Service role full access payment_transactions" ON payment_transactions
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 2. finance_transactions — Platform/provider earnings (migration 014)
-- ============================================================================
ALTER TABLE IF EXISTS finance_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'finance_transactions' AND policyname = 'Providers can view own finance transactions'
  ) THEN
    CREATE POLICY "Providers can view own finance transactions" ON finance_transactions
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM bookings b
          JOIN providers p ON p.id = b.provider_id
          WHERE b.id = finance_transactions.booking_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'finance_transactions' AND policyname = 'Service role full access finance_transactions'
  ) THEN
    CREATE POLICY "Service role full access finance_transactions" ON finance_transactions
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 3. booking_payments — Per-booking payment records (migration 126)
-- ============================================================================
ALTER TABLE IF EXISTS booking_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'booking_payments' AND policyname = 'Customers can view own booking payments'
  ) THEN
    CREATE POLICY "Customers can view own booking payments" ON booking_payments
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = booking_payments.booking_id
          AND b.customer_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'booking_payments' AND policyname = 'Providers can manage own booking payments'
  ) THEN
    CREATE POLICY "Providers can manage own booking payments" ON booking_payments
      FOR ALL USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM bookings b
          JOIN providers p ON p.id = b.provider_id
          WHERE b.id = booking_payments.booking_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'booking_payments' AND policyname = 'Service role full access booking_payments'
  ) THEN
    CREATE POLICY "Service role full access booking_payments" ON booking_payments
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 4. payments — Core payments table (migration 006)
-- ============================================================================
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Users can view own payments'
  ) THEN
    CREATE POLICY "Users can view own payments" ON payments
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Providers can view payments for their bookings'
  ) THEN
    CREATE POLICY "Providers can view payments for their bookings" ON payments
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        payments.provider_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM providers p
          WHERE p.id = payments.provider_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Service role full access payments'
  ) THEN
    CREATE POLICY "Service role full access payments" ON payments
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 5. webhook_events — Paystack webhook processing records (migration 014)
-- ============================================================================
ALTER TABLE IF EXISTS webhook_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'Service role full access webhook_events'
  ) THEN
    CREATE POLICY "Service role full access webhook_events" ON webhook_events
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'Admins can view webhook events'
  ) THEN
    CREATE POLICY "Admins can view webhook events" ON webhook_events
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 6. payment_methods — Saved card tokens (migration 002)
-- ============================================================================
ALTER TABLE IF EXISTS payment_methods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_methods' AND policyname = 'Users can manage own payment methods'
  ) THEN
    CREATE POLICY "Users can manage own payment methods" ON payment_methods
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_methods' AND policyname = 'Service role full access payment_methods'
  ) THEN
    CREATE POLICY "Service role full access payment_methods" ON payment_methods
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 7. payouts — Provider payout records (migration 006)
-- ============================================================================
ALTER TABLE IF EXISTS payouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payouts' AND policyname = 'Providers can view own payouts'
  ) THEN
    CREATE POLICY "Providers can view own payouts" ON payouts
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM providers p
          WHERE p.id = payouts.provider_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payouts' AND policyname = 'Service role full access payouts'
  ) THEN
    CREATE POLICY "Service role full access payouts" ON payouts
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 8. provider_invoices — Provider invoices (migration 154)
-- ============================================================================
ALTER TABLE IF EXISTS provider_invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'provider_invoices' AND policyname = 'Providers can manage own invoices'
  ) THEN
    CREATE POLICY "Providers can manage own invoices" ON provider_invoices
      FOR ALL USING (
        auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM providers p
          WHERE p.id = provider_invoices.provider_id
          AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'provider_invoices' AND policyname = 'Service role full access provider_invoices'
  ) THEN
    CREATE POLICY "Service role full access provider_invoices" ON provider_invoices
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 9. Performance indexes for common query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON bookings (provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON bookings (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments (provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id ON booking_payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_provider_id ON provider_staff (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_user_id ON provider_staff (user_id);
CREATE INDEX IF NOT EXISTS idx_offerings_provider_id ON offerings (provider_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
