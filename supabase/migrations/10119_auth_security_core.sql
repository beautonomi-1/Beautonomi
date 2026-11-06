-- ============================================================================
-- 10119: Provider auth security — devices, step-up, MFA recovery, impersonation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_key_hash text NOT NULL,
  app_type text NOT NULL DEFAULT 'provider',
  label text,
  platform text,
  last_ip_country text,
  onesignal_player_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  last_seen_at timestamptz NOT NULL DEFAULT NOW(),
  trusted_until timestamptz,
  limited_until timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  CONSTRAINT user_trusted_devices_user_key UNIQUE (user_id, device_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_trusted_devices_user_id ON public.user_trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_user_trusted_devices_trusted_until ON public.user_trusted_devices (trusted_until);

CREATE TABLE IF NOT EXISTS public.user_security_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  has_verified_totp boolean NOT NULL DEFAULT false,
  totp_factor_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auth_session_verifications (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.user_trusted_devices (id) ON DELETE SET NULL,
  method text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_session_verifications_user ON public.auth_session_verifications (user_id);

CREATE TABLE IF NOT EXISTS public.auth_device_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid,
  purpose text NOT NULL DEFAULT 'device_verification'
    CHECK (purpose IN ('device_verification', 'step_up')),
  device_key_hash text,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  approved_by_device_id uuid REFERENCES public.user_trusted_devices (id) ON DELETE SET NULL,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_device_challenges_user ON public.auth_device_challenges (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_device_challenges_expires ON public.auth_device_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.auth_step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  method text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_step_up_grants_session ON public.auth_step_up_grants (session_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_step_up_grants_expires ON public.auth_step_up_grants (expires_at);

CREATE TABLE IF NOT EXISTS public.user_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_recovery_codes_user ON public.user_mfa_recovery_codes (user_id);

CREATE TABLE IF NOT EXISTS public.auth_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash_sha256 text NOT NULL UNIQUE,
  admin_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_impersonation_sessions_session ON public.auth_impersonation_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_auth_impersonation_sessions_target ON public.auth_impersonation_sessions (target_user_id);

CREATE TABLE IF NOT EXISTS public.user_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id text NOT NULL UNIQUE,
  report_token_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_security_events_user ON public.user_security_events (user_id, created_at DESC);

ALTER TABLE public.user_trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_session_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_step_up_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_events ENABLE ROW LEVEL SECURITY;

-- Seed provider_protection defaults when missing (do not overwrite existing keys)
UPDATE public.platform_settings
SET settings = jsonb_set(
      CASE
        WHEN settings ? 'security' THEN settings
        ELSE settings || jsonb_build_object('security', '{}'::jsonb)
      END,
      '{security,provider_protection}',
      jsonb_build_object(
        'step_up', 'off',
        'device_verification', 'off',
        'step_up_window_seconds', 600,
        'trusted_device_days', 180,
        'limited_trust_hours', 24,
        'rollout_started_at', NULL
      ),
      true
    ),
    updated_at = NOW()
WHERE is_active = true
  AND NOT COALESCE(settings #> '{security,provider_protection}' ? 'step_up', false);

CREATE OR REPLACE FUNCTION public.get_provider_session_security(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  has_verified_totp boolean,
  session_verified boolean,
  device_limited_until timestamptz,
  step_up_grant_expires_at timestamptz,
  is_impersonation boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totp boolean;
  v_verified boolean;
  v_limited timestamptz;
  v_step_up timestamptz;
  v_imp boolean;
BEGIN
  SELECT COALESCE(uss.has_verified_totp, false)
  INTO v_totp
  FROM public.user_security_state uss
  WHERE uss.user_id = p_user_id;

  IF NOT FOUND THEN
    v_totp := false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.auth_session_verifications v
    LEFT JOIN public.user_trusted_devices d ON d.id = v.device_id
    WHERE v.session_id = p_session_id AND v.user_id = p_user_id
      AND (v.device_id IS NULL OR d.revoked_at IS NULL)
  )
  INTO v_verified;

  SELECT MAX(d.limited_until)
  INTO v_limited
  FROM public.auth_session_verifications v
  JOIN public.user_trusted_devices d ON d.id = v.device_id
  WHERE v.session_id = p_session_id AND v.user_id = p_user_id
    AND d.revoked_at IS NULL;

  SELECT MAX(g.expires_at)
  INTO v_step_up
  FROM public.auth_step_up_grants g
  WHERE g.session_id = p_session_id AND g.user_id = p_user_id AND g.expires_at > NOW();

  SELECT EXISTS (
    SELECT 1 FROM public.auth_impersonation_sessions imp
    WHERE imp.target_user_id = p_user_id
      AND imp.session_id = p_session_id
      AND imp.expires_at > NOW()
  )
  INTO v_imp;

  RETURN QUERY SELECT v_totp, v_verified, v_limited, v_step_up, v_imp;
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_session_security(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_session_security(uuid, uuid) TO service_role;
