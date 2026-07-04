-- Migration 746: Provider payment terminal profile
--
-- Replaces the vendor-specific `yoco_machine` / `yoco_machine_other` columns
-- on `providers` with a structured, provider-neutral capability table.
-- The old columns are backfilled and dropped in migration 747.

-- ── 1. Enum types ─────────────────────────────────────────────────────────────

CREATE TYPE terminal_ownership_status AS ENUM (
  'has_terminal',
  'no_terminal',
  'planning_to_get_terminal',
  'unsure'
);

CREATE TYPE terminal_count_range AS ENUM (
  'one',
  'two_to_three',
  'four_to_ten',
  'more_than_ten',
  'unsure'
);

CREATE TYPE terminal_active_usage_status AS ENUM (
  'yes',
  'no',
  'sometimes',
  'unsure'
);

CREATE TYPE terminal_interest_level AS ENUM (
  'yes',
  'maybe_later',
  'no'
);

CREATE TYPE terminal_profile_source AS ENUM (
  'onboarding',
  'profile_update',
  'superadmin_update',
  'campaign_response'
);

-- ── 2. Main profile table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_payment_terminal_profile (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id                     UUID NOT NULL UNIQUE
    REFERENCES public.providers(id) ON DELETE CASCADE,

  -- Core capture fields
  has_payment_terminal            BOOLEAN,
  terminal_ownership_status       terminal_ownership_status,

  -- Vendor / model detail (populated when has_terminal)
  terminal_provider               TEXT,           -- e.g. 'yoco', 'ikhokha', 'capitec', 'fnb', ...
  terminal_provider_other         TEXT,           -- free-text when terminal_provider = 'other'

  -- Quantity
  terminal_count_range            terminal_count_range,

  -- Usage
  terminal_active_usage_status    terminal_active_usage_status,

  -- Interest signals
  interested_in_platform_terminal terminal_interest_level,
  interested_in_terminal_subscription BOOLEAN,
  interested_in_integrated_payments   BOOLEAN,

  -- Provenance
  source                          terminal_profile_source NOT NULL DEFAULT 'onboarding',
  captured_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES public.users(id),
  updated_by                      UUID REFERENCES public.users(id),

  CONSTRAINT chk_terminal_other_text
    CHECK (terminal_provider <> 'other' OR terminal_provider_other IS NOT NULL OR terminal_provider_other IS NULL)
);

-- ── 3. Indexes (for segmentation queries in Superadmin) ───────────────────────

CREATE INDEX IF NOT EXISTS idx_pptp_tenant_id
  ON public.provider_payment_terminal_profile(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pptp_terminal_ownership_status
  ON public.provider_payment_terminal_profile(terminal_ownership_status);

CREATE INDEX IF NOT EXISTS idx_pptp_interested_in_platform_terminal
  ON public.provider_payment_terminal_profile(interested_in_platform_terminal);

CREATE INDEX IF NOT EXISTS idx_pptp_terminal_provider
  ON public.provider_payment_terminal_profile(terminal_provider);

CREATE INDEX IF NOT EXISTS idx_pptp_updated_at
  ON public.provider_payment_terminal_profile(updated_at DESC);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_pptp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pptp_updated_at
  BEFORE UPDATE ON public.provider_payment_terminal_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_pptp_updated_at();

-- ── 5. Row-level security ─────────────────────────────────────────────────────

ALTER TABLE public.provider_payment_terminal_profile ENABLE ROW LEVEL SECURITY;

-- Providers can read their own profile
CREATE POLICY pptp_provider_select ON public.provider_payment_terminal_profile
  FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Providers can upsert their own profile
CREATE POLICY pptp_provider_insert ON public.provider_payment_terminal_profile
  FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY pptp_provider_update ON public.provider_payment_terminal_profile
  FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Superadmin bypass (service role)
CREATE POLICY pptp_service_role_all ON public.provider_payment_terminal_profile
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 6. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.provider_payment_terminal_profile IS
  'Provider-neutral card machine / payment terminal capability capture. Replaces vendor-specific yoco_machine columns on providers.';

COMMENT ON COLUMN public.provider_payment_terminal_profile.terminal_provider IS
  'Known terminal vendor (yoco, ikhokha, capitec, fnb, nedbank, absa, standard_bank, psp, other). Free-form for "other" with terminal_provider_other.';

COMMENT ON COLUMN public.provider_payment_terminal_profile.source IS
  'How this record was created/last updated: onboarding, profile_update, superadmin_update, or campaign_response.';
