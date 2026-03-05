-- Yoco webhook and refund support: missing tables and payment columns
-- 302_yoco_webhooks_refunds_tables.sql

-- Per-provider webhook config (webhook_id from Yoco → provider + secret)
CREATE TABLE IF NOT EXISTS provider_yoco_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    webhook_id TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(webhook_id)
);

CREATE INDEX IF NOT EXISTS idx_yoco_webhooks_provider ON provider_yoco_webhooks(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_webhooks_webhook_id ON provider_yoco_webhooks(webhook_id);

-- Webhook event log (one row per received event)
CREATE TABLE IF NOT EXISTS provider_yoco_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    signature TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_yoco_webhook_events_webhook_id ON provider_yoco_webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_yoco_webhook_events_created ON provider_yoco_webhook_events(created_at DESC);

-- Refund records (linked to Yoco payment id)
CREATE TABLE IF NOT EXISTS provider_yoco_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    yoco_refund_id TEXT NOT NULL,
    payment_id TEXT,
    amount BIGINT,
    currency TEXT DEFAULT 'ZAR',
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yoco_refunds_provider ON provider_yoco_refunds(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_refunds_payment ON provider_yoco_refunds(payment_id);

-- Refund fields on payments (used by webhook handler)
ALTER TABLE provider_yoco_payments
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount BIGINT;

COMMENT ON COLUMN provider_yoco_payments.refund_status IS 'fully_refunded, partially_refunded, or null';
COMMENT ON COLUMN provider_yoco_payments.refund_amount IS 'Refunded amount in cents';

-- RLS for provider_yoco_webhooks
ALTER TABLE provider_yoco_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view their own Yoco webhooks" ON provider_yoco_webhooks;
CREATE POLICY "Providers can view their own Yoco webhooks"
    ON provider_yoco_webhooks FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage their own Yoco webhooks" ON provider_yoco_webhooks;
CREATE POLICY "Providers can manage their own Yoco webhooks"
    ON provider_yoco_webhooks FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- RLS for provider_yoco_webhook_events: allow anon insert/update so webhook endpoint can log and update
ALTER TABLE provider_yoco_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow webhook ingest" ON provider_yoco_webhook_events;
CREATE POLICY "Allow webhook ingest"
    ON provider_yoco_webhook_events FOR ALL
    USING (true)
    WITH CHECK (true);

-- RLS for provider_yoco_refunds
ALTER TABLE provider_yoco_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view their own Yoco refunds" ON provider_yoco_refunds;
CREATE POLICY "Providers can view their own Yoco refunds"
    ON provider_yoco_refunds FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service can insert Yoco refunds" ON provider_yoco_refunds;
CREATE POLICY "Service can insert Yoco refunds"
    ON provider_yoco_refunds FOR INSERT
    WITH CHECK (true);

COMMENT ON TABLE provider_yoco_webhooks IS 'Maps Yoco webhook ID to provider and webhook secret for signature verification';
COMMENT ON TABLE provider_yoco_webhook_events IS 'Log of received Yoco webhook events';
COMMENT ON TABLE provider_yoco_refunds IS 'Yoco refund records from webhook notifications';
