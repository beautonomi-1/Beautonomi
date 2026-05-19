-- 610_yoco_oauth_credential_mode.sql
--
-- §Yoco-OAuth 2026-05: Yoco's Web POS / Orders / Payouts / Refunds endpoints
-- on api.yoco.com require an OAuth-issued JWT access token (scopes
-- `business/webpos:read+write`, `business/payments:read`). The previous
-- integration stored only the dashboard `sk_live_*` Bearer and sent that to
-- `POST /v1/webpos/`, which Yoco rejects with `detail: "The provided
-- credentials are invalid"`. This migration adds the missing OAuth state
-- so the API routes can store/refresh tokens per provider, plus a
-- credential-mode flag so the routes can branch between OAuth Web POS and
-- the dashboard-key Checkout API at payments.yoco.com.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Per-tenant Yoco OAuth app registrations
--    Same pattern as migration 356 (gemini/aura/sumsub integration configs):
--    tenant_id NULL = platform-wide default, tenant_id = X = white-label
--    override. Scoped by environment so we can keep sandbox + live in parallel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_yoco_oauth_apps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    environment     TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox','live')),
    client_id       TEXT NOT NULL,
    client_secret   TEXT NOT NULL,
    redirect_uri    TEXT NOT NULL,
    default_scopes  TEXT NOT NULL DEFAULT 'openid offline_access business/webpos:read business/webpos:write business/payments:read business/payments:write business/webhooks:write business/refunds:read business/refunds:write business/orders:read business/payouts:read',
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_yoco_oauth_apps_global_env
    ON public.tenant_yoco_oauth_apps(environment)
    WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_yoco_oauth_apps_tenant_env
    ON public.tenant_yoco_oauth_apps(tenant_id, environment)
    WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_yoco_oauth_apps_tenant
    ON public.tenant_yoco_oauth_apps(tenant_id);

COMMENT ON TABLE  public.tenant_yoco_oauth_apps IS 'Yoco OAuth client_id/secret per tenant + environment. tenant_id NULL = platform default. Mirrors migration 356 pattern.';
COMMENT ON COLUMN public.tenant_yoco_oauth_apps.client_secret IS 'Yoco OAuth client_secret; should be encrypted at rest in production deployments.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Per-provider OAuth tokens (one row per provider+environment)
--    access_token: short-lived JWT (~14 days) used as Bearer on api.yoco.com.
--    refresh_token: ~60 day lifetime, used to mint a new access_token.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_yoco_oauth_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    tenant_id           UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    environment         TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox','live')),
    access_token        TEXT NOT NULL,
    refresh_token       TEXT,
    token_type          TEXT NOT NULL DEFAULT 'bearer',
    scope               TEXT,
    expires_at          TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ,
    business_id         TEXT,
    business_name       TEXT,
    user_email          TEXT,
    last_refreshed_at   TIMESTAMPTZ,
    last_refresh_error  TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_provider_yoco_oauth_tokens_provider
    ON public.provider_yoco_oauth_tokens(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_yoco_oauth_tokens_tenant
    ON public.provider_yoco_oauth_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_yoco_oauth_tokens_expires
    ON public.provider_yoco_oauth_tokens(expires_at);

COMMENT ON TABLE  public.provider_yoco_oauth_tokens IS 'OAuth access/refresh tokens minted by iam.yoco.com for each provider that connects Yoco via OAuth 2.0.';
COMMENT ON COLUMN public.provider_yoco_oauth_tokens.expires_at IS 'When access_token expires. getValidAccessToken() refreshes if (expires_at - now) < 5 minutes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Short-lived CSRF state rows for the OAuth authorize → callback handoff
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.yoco_oauth_states (
    state         TEXT PRIMARY KEY,
    provider_id   UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    environment   TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox','live')),
    return_to     TEXT,
    code_verifier TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_yoco_oauth_states_provider
    ON public.yoco_oauth_states(provider_id);
CREATE INDEX IF NOT EXISTS idx_yoco_oauth_states_expires
    ON public.yoco_oauth_states(expires_at);

COMMENT ON TABLE public.yoco_oauth_states IS 'Single-use CSRF state for the Yoco OAuth authorize→callback handshake. Rows expire 15 minutes after creation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Tag existing integration / device rows with the credential mode so the
--    API routes can pick the correct Yoco API to call.
--    credential_mode on the integration row tells the routes WHICH credential
--    the provider has stored:
--      - 'oauth'    → use provider_yoco_oauth_tokens (Web POS / api.yoco.com)
--      - 'checkout' → use provider_yoco_integrations.secret_key (Checkout API
--                     at payments.yoco.com — hosted checkout pages only)
--      - 'none'     → no usable credential
--    credential_mode on the device row tells the payments route how to charge
--    it: 'web_pos' (real Yoco terminal) vs 'virtual_checkout' (just a label;
--    payments create a Yoco Checkout link/QR for the customer).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_yoco_integrations
    ADD COLUMN IF NOT EXISTS credential_mode TEXT
        NOT NULL DEFAULT 'none'
        CHECK (credential_mode IN ('none','checkout','oauth'));

ALTER TABLE public.provider_yoco_integrations
    ADD COLUMN IF NOT EXISTS environment TEXT
        NOT NULL DEFAULT 'live'
        CHECK (environment IN ('sandbox','live'));

COMMENT ON COLUMN public.provider_yoco_integrations.credential_mode IS
    'Which Yoco API the provider can call: oauth=api.yoco.com (Web POS), checkout=payments.yoco.com (hosted checkout), none=not configured.';
COMMENT ON COLUMN public.provider_yoco_integrations.environment IS
    'live or sandbox. Determines which Yoco host (api.yoco.com vs api.yocosandbox.com) the routes hit.';

ALTER TABLE public.provider_yoco_devices
    ADD COLUMN IF NOT EXISTS credential_mode TEXT
        NOT NULL DEFAULT 'web_pos'
        CHECK (credential_mode IN ('web_pos','virtual_checkout'));

COMMENT ON COLUMN public.provider_yoco_devices.credential_mode IS
    'How to charge this device: web_pos calls api.yoco.com /v1/webpos/{id}/payments with the provider OAuth token; virtual_checkout creates a Yoco Checkout link/QR on payments.yoco.com using the dashboard secret_key.';

ALTER TABLE public.provider_yoco_webhooks
    ADD COLUMN IF NOT EXISTS environment TEXT
        NOT NULL DEFAULT 'live'
        CHECK (environment IN ('sandbox','live')),
    ADD COLUMN IF NOT EXISTS callback_url TEXT;

CREATE INDEX IF NOT EXISTS idx_yoco_webhooks_provider_env_callback
    ON public.provider_yoco_webhooks(provider_id, environment, callback_url);

COMMENT ON COLUMN public.provider_yoco_webhooks.environment IS
    'Yoco environment for this webhook subscription; used to avoid treating sandbox and live subscriptions as interchangeable.';
COMMENT ON COLUMN public.provider_yoco_webhooks.callback_url IS
    'Callback URL registered with Yoco; OAuth callback re-registers when the deployed URL changes.';

-- Backfill: any existing enabled integration row that has a stored secret_key
-- has, until now, only been usable via the Checkout API (the Web POS call has
-- always rejected with "invalid credentials"). Mark them as 'checkout' so the
-- routes pick the Checkout API code path until the provider reconnects via
-- OAuth. We never overwrite a row that already has credential_mode set.
UPDATE public.provider_yoco_integrations
SET credential_mode = 'checkout'
WHERE credential_mode = 'none'
  AND is_enabled = true
  AND secret_key IS NOT NULL
  AND length(btrim(secret_key)) > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Triggers for updated_at parity with sibling Yoco tables
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_tenant_yoco_oauth_apps_updated_at ON public.tenant_yoco_oauth_apps;
CREATE TRIGGER update_tenant_yoco_oauth_apps_updated_at
    BEFORE UPDATE ON public.tenant_yoco_oauth_apps
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_yoco_oauth_tokens_updated_at ON public.provider_yoco_oauth_tokens;
CREATE TRIGGER update_provider_yoco_oauth_tokens_updated_at
    BEFORE UPDATE ON public.provider_yoco_oauth_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RLS
--    OAuth app registrations: only superadmins (service role) write; nobody
--      reads via PostgREST (the resolveOauthApp helper uses the service-role
--      key on the server). Disable RLS access via no-op policies.
--    Provider OAuth tokens: owners/staff may SEE that a token exists
--      (no plaintext exposed via PostgREST; the API redacts it) — write only
--      from the OAuth callback (service role).
--    State rows: write-only by the route handlers (service role).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_yoco_oauth_apps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_yoco_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yoco_oauth_states         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers see their own Yoco OAuth tokens"     ON public.provider_yoco_oauth_tokens;
CREATE POLICY "Providers see their own Yoco OAuth tokens"
    ON public.provider_yoco_oauth_tokens FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM public.providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
        )
    );

-- The OAuth callback and refresh helpers run under the service role, which
-- bypasses RLS; no INSERT/UPDATE/DELETE policies are exposed to end users.

COMMENT ON TABLE public.tenant_yoco_oauth_apps    IS 'Read/write reserved to service role; no end-user policies are defined.';
COMMENT ON TABLE public.yoco_oauth_states         IS 'Read/write reserved to service role; rows are single-use and short-lived.';
