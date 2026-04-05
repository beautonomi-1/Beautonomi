-- Spec §6.5 — integration capability registry (reference + validation hooks).
CREATE TABLE IF NOT EXISTS public.integration_capabilities (
  integration_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'tenant', 'provider')),
  secret_owner TEXT NOT NULL CHECK (secret_owner IN ('platform', 'tenant', 'provider')),
  fallback_allowed BOOLEAN NOT NULL DEFAULT false,
  public_config_key_hints TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_capabilities ENABLE ROW LEVEL SECURITY;

INSERT INTO public.integration_capabilities (
  integration_key, scope, secret_owner, fallback_allowed, public_config_key_hints, description
) VALUES
  ('payments_online_checkout', 'tenant', 'tenant', false,
    ARRAY['allowed_gateway_families', 'default_gateway_family', 'enabled_gateway_families'],
    'Platform-collected online checkout; tenant defines allowed/default gateway families'),
  ('payments_inperson_pos', 'tenant', 'tenant', false,
    ARRAY['allowed_pos_families', 'default_pos_family'],
    'In-person / POS rails; tenant defines allowed families; provider enables within tenant'),
  ('maps_geocoding', 'tenant', 'tenant', true,
    ARRAY['provider', 'enabled'],
    'Map geocoding/directions; optional global token fallback if fallback_allowed'),
  ('messaging_push', 'tenant', 'tenant', true,
    ARRAY['enabled', 'customer_app_id', 'provider_app_id'],
    'OneSignal or equivalent'),
  ('messaging_sms', 'provider', 'provider', false,
    ARRAY['enabled'],
    'SMS often provider-scoped'),
  ('analytics_product', 'tenant', 'tenant', true,
    ARRAY['enabled', 'project_key_public'],
    'Amplitude etc.'),
  ('kyc_identity', 'tenant', 'tenant', false,
    ARRAY['enabled', 'level'],
    'Sumsub or equivalent'),
  ('fraud_risk', 'tenant', 'tenant', false,
    ARRAY['enabled', 'ruleset'],
    'Fraud provider or internal rules'),
  ('calendar_google', 'tenant', 'tenant', false,
    ARRAY['enabled', 'client_id_public'],
    'Google Calendar OAuth'),
  ('calendar_outlook', 'tenant', 'tenant', false,
    ARRAY['enabled', 'client_id_public'],
    'Outlook Calendar OAuth')
ON CONFLICT (integration_key) DO NOTHING;

-- Webhook idempotency ledger (spec §10 — foundation for multi-tenant PSP routing).
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'ignored')),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_tenant ON public.payment_webhook_events (tenant_id, processed_at DESC);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
