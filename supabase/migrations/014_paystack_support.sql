-- Beautonomi Database Migration
-- 014_paystack_support.sql
-- Adds missing tables/columns used by Paystack initialize + webhook handlers

-- Booking payment tracking fields (used by /api/payments/initialize and /api/payments/webhook)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT;

-- Paystack splits (optional; used if platform enables transaction splits)
CREATE TABLE IF NOT EXISTS paystack_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_code TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(split_code)
);

CREATE TRIGGER update_paystack_splits_updated_at BEFORE UPDATE ON paystack_splits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Provider Paystack subaccounts (optional; used for provider-specific splits)
CREATE TABLE IF NOT EXISTS provider_paystack_subaccounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  subaccount_code TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, subaccount_code)
);

CREATE TRIGGER update_provider_paystack_subaccounts_updated_at BEFORE UPDATE ON provider_paystack_subaccounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Webhook events (idempotency + monitoring)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  source TEXT NOT NULL, -- 'paystack', etc.
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, source)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_status ON webhook_events(source, status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at DESC);

CREATE TRIGGER update_webhook_events_updated_at BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment transactions (ledger of external gateway transactions)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  provider TEXT NOT NULL, -- 'paystack', etc.
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, reference)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at DESC);

-- Finance transactions (platform/providerearnings tracking)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL, -- 'payment', 'provider_earnings', etc.
  amount NUMERIC(10, 2) NOT NULL,
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net NUMERIC(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_booking ON finance_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_created_at ON finance_transactions(created_at DESC);

