-- Migration 770: PayCloud / WiseCashier Cloud Mode in-person terminal integration
-- Whitelabel Beautonomi card machines — provider-collected tender (like Yoco).

-- ── 1. Platform credentials ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_paycloud_apps (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    environment             TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox', 'live')),
    app_id                  TEXT NOT NULL,
    app_rsa_private_key     TEXT NOT NULL,
    gateway_rsa_public_key  TEXT NOT NULL,
    api_base_url            TEXT NOT NULL,
    is_enabled              BOOLEAN NOT NULL DEFAULT true,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_paycloud_apps_global_env
    ON public.tenant_paycloud_apps(environment) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_paycloud_apps_tenant_env
    ON public.tenant_paycloud_apps(tenant_id, environment) WHERE tenant_id IS NOT NULL;

-- ── 2. Merchant / store identities (admin-managed) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.paycloud_merchants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    label                   TEXT NOT NULL,
    merchant_no             TEXT NOT NULL,
    store_no                TEXT NOT NULL,
    environment             TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox', 'live')),
    paycloud_app_id         UUID REFERENCES public.tenant_paycloud_apps(id) ON DELETE SET NULL,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, merchant_no, store_no, environment)
);

CREATE INDEX IF NOT EXISTS idx_paycloud_merchants_tenant ON public.paycloud_merchants(tenant_id);

-- ── 3. Terminal registry (fleet + provider assignments) ───────────────────────

CREATE TYPE public.paycloud_terminal_status AS ENUM (
    'in_stock',
    'assigned',
    'active',
    'suspended',
    'decommissioned',
    'rma'
);

CREATE TYPE public.paycloud_terminal_source AS ENUM (
    'self_add',
    'admin',
    'order'
);

CREATE TABLE IF NOT EXISTS public.paycloud_terminals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    paycloud_merchant_id    UUID REFERENCES public.paycloud_merchants(id) ON DELETE SET NULL,
    provider_id             UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    location_id             UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL,
    terminal_sn             TEXT NOT NULL,
    display_name            TEXT NOT NULL,
    model                   TEXT,
    status                  public.paycloud_terminal_status NOT NULL DEFAULT 'in_stock',
    source                  public.paycloud_terminal_source NOT NULL DEFAULT 'admin',
    terminal_asset_id       UUID REFERENCES public.terminal_assets(id) ON DELETE SET NULL,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    in_flight_payment_id    UUID,
    last_used_at            TIMESTAMPTZ,
    total_transactions      INTEGER NOT NULL DEFAULT 0,
    total_amount            NUMERIC(14, 2) NOT NULL DEFAULT 0,
    last_error              TEXT,
    assigned_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_at             TIMESTAMPTZ,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_paycloud_terminals_sn_tenant
    ON public.paycloud_terminals(tenant_id, terminal_sn);
CREATE INDEX IF NOT EXISTS idx_paycloud_terminals_provider ON public.paycloud_terminals(provider_id);
CREATE INDEX IF NOT EXISTS idx_paycloud_terminals_location ON public.paycloud_terminals(location_id);
CREATE INDEX IF NOT EXISTS idx_paycloud_terminals_active ON public.paycloud_terminals(provider_id, is_active) WHERE is_active = true;

-- ── 4. Provider settings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_paycloud_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id             UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE UNIQUE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    accept_paycloud         BOOLEAN NOT NULL DEFAULT false,
    qr_payments_enabled     BOOLEAN NOT NULL DEFAULT false,
    cashback_enabled        BOOLEAN NOT NULL DEFAULT false,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider-level accept toggle (mirrors accept_paystack_terminal)
ALTER TABLE public.providers
    ADD COLUMN IF NOT EXISTS accept_paycloud BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.accept_paycloud IS
    'When true and payment_paycloud flag is on, provider can collect in-person card via PayCloud terminals.';

-- ── 5. Payments ───────────────────────────────────────────────────────────────

CREATE TYPE public.paycloud_payment_status AS ENUM (
    'pending',
    'processing',
    'successful',
    'failed',
    'cancelled',
    'closed'
);

CREATE TYPE public.paycloud_amount_match_status AS ENUM (
    'exact',
    'over',
    'under',
    'mismatch',
    'pending'
);

CREATE TABLE IF NOT EXISTS public.provider_paycloud_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider_id             UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    terminal_id             UUID REFERENCES public.paycloud_terminals(id) ON DELETE SET NULL,
    merchant_order_no       TEXT NOT NULL,
    paycloud_order_id       TEXT,
    trans_status            TEXT,
    amount                  NUMERIC(14, 2) NOT NULL,
    tip_amount              NUMERIC(14, 2) NOT NULL DEFAULT 0,
    cashback_amount         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    expected_amount         NUMERIC(14, 2) NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'ZAR',
    amount_match_status     public.paycloud_amount_match_status NOT NULL DEFAULT 'pending',
    status                  public.paycloud_payment_status NOT NULL DEFAULT 'pending',
    environment             TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox', 'live')),
    entity_type             TEXT NOT NULL,
    entity_id               TEXT NOT NULL,
    booking_id              UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    sale_id                 UUID,
    group_booking_id        UUID,
    product_order_id        UUID,
    additional_charge_id    UUID,
    pay_scenario            TEXT NOT NULL DEFAULT 'SWIPE_CARD',
    pay_method_id           TEXT,
    trans_type              INTEGER NOT NULL DEFAULT 1,
    processed_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
    error_message           TEXT,
    response_code           TEXT,
    raw_request             JSONB,
    raw_response            JSONB,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_paycloud_payments_merchant_order
    ON public.provider_paycloud_payments(provider_id, merchant_order_no);
CREATE INDEX IF NOT EXISTS idx_paycloud_payments_provider ON public.provider_paycloud_payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_paycloud_payments_status ON public.provider_paycloud_payments(status);
CREATE INDEX IF NOT EXISTS idx_paycloud_payments_entity ON public.provider_paycloud_payments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_paycloud_payments_booking ON public.provider_paycloud_payments(booking_id);

-- ── 6. Webhook events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paycloud_webhook_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    provider_id             UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    payment_id              UUID REFERENCES public.provider_paycloud_payments(id) ON DELETE SET NULL,
    merchant_order_no       TEXT,
    event_type              TEXT,
    signature_valid         BOOLEAN,
    processed               BOOLEAN NOT NULL DEFAULT false,
    processing_error        TEXT,
    payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paycloud_webhook_events_payment ON public.paycloud_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_paycloud_webhook_events_order ON public.paycloud_webhook_events(merchant_order_no);

-- ── 7. booking_payments allowlist + idempotency ───────────────────────────────

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'booking_payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%payment_provider%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE booking_payments DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.booking_payments
  ADD CONSTRAINT booking_payments_payment_provider_check
  CHECK (payment_provider IS NULL OR payment_provider IN (
    'stripe', 'cash', 'paystack', 'flutterwave', 'yoco', 'paycloud', 'other'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_paycloud_idempotency_uidx
  ON public.booking_payments(payment_provider, payment_provider_id)
  WHERE payment_provider = 'paycloud' AND payment_provider_id IS NOT NULL;

-- ── 8. Feature flag ───────────────────────────────────────────────────────────

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_paycloud',
    'PayCloud card machines',
    'Enable provider-side Beautonomi card machine collection via PayCloud/WiseCashier Cloud Mode. Disable to hide card machines as a provider payment method.',
    false,
    'payments'
WHERE NOT EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE feature_key = 'payment_paycloud' AND tenant_id IS NULL
);

-- Optional sub-flags
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT 'payment_paycloud_qr', 'PayCloud QR wallets', 'Enable QR wallet payments on Beautonomi card machines.', false, 'payments'
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE feature_key = 'payment_paycloud_qr' AND tenant_id IS NULL);

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT 'payment_paycloud_cashback', 'PayCloud cashback', 'Enable cashback on Beautonomi card machine sales.', false, 'payments'
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE feature_key = 'payment_paycloud_cashback' AND tenant_id IS NULL);

-- ── 9. updated_at triggers ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_tenant_paycloud_apps_updated_at ON public.tenant_paycloud_apps;
CREATE TRIGGER update_tenant_paycloud_apps_updated_at
    BEFORE UPDATE ON public.tenant_paycloud_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_paycloud_merchants_updated_at ON public.paycloud_merchants;
CREATE TRIGGER update_paycloud_merchants_updated_at
    BEFORE UPDATE ON public.paycloud_merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_paycloud_terminals_updated_at ON public.paycloud_terminals;
CREATE TRIGGER update_paycloud_terminals_updated_at
    BEFORE UPDATE ON public.paycloud_terminals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_paycloud_settings_updated_at ON public.provider_paycloud_settings;
CREATE TRIGGER update_provider_paycloud_settings_updated_at
    BEFORE UPDATE ON public.provider_paycloud_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_paycloud_payments_updated_at ON public.provider_paycloud_payments;
CREATE TRIGGER update_provider_paycloud_payments_updated_at
    BEFORE UPDATE ON public.provider_paycloud_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 10. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_paycloud_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paycloud_merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paycloud_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_paycloud_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_paycloud_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paycloud_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role full access (API routes use service role or provider-scoped policies)
CREATE POLICY paycloud_terminals_service ON public.paycloud_terminals FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY paycloud_payments_service ON public.provider_paycloud_payments FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY paycloud_settings_service ON public.provider_paycloud_settings FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY paycloud_webhooks_service ON public.paycloud_webhook_events FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY paycloud_merchants_service ON public.paycloud_merchants FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY tenant_paycloud_apps_service ON public.tenant_paycloud_apps FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Realtime for staff alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_paycloud_payments;
