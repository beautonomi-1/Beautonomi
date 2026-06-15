-- ============================================================================
-- 693: enforce admin two-factor by default (security policy is now authoritative)
-- ============================================================================
-- As of this release, admin MFA enforcement is governed SOLELY by
-- platform_settings.security.two_factor ({ enabled, required_for_admins }) in
-- EVERY environment, including production (see requireAdminMfaIfRequired in
-- apps/web/src/lib/supabase/api-helpers.ts). Previously production forced MFA
-- unconditionally; now the DB toggle is the single source of truth.
--
-- Because the policy defaults to OFF, applying the code change alone would leave
-- a window with NO admin MFA. This migration closes that window by turning the
-- policy ON wherever it is applied. Superadmins can change it afterwards from the
-- admin Security page (PATCH /api/admin/security).
--
-- Idempotent: re-running simply re-asserts {enabled:true, required_for_admins:true}.
-- Other security sub-objects (password_policy, rate_limiting, data_retention) and
-- all other top-level settings keys are preserved.

-- 1) Update existing active settings row(s): ensure a `security` object exists,
--    then set two_factor without clobbering sibling security settings.
UPDATE public.platform_settings
SET settings = jsonb_set(
      CASE
        WHEN settings ? 'security' THEN settings
        ELSE settings || jsonb_build_object('security', '{}'::jsonb)
      END,
      '{security,two_factor}',
      jsonb_build_object('enabled', true, 'required_for_admins', true),
      true
    ),
    updated_at = NOW()
WHERE is_active = true;

-- 2) If no active settings row exists yet, create one with the policy enabled.
INSERT INTO public.platform_settings (settings, is_active)
SELECT jsonb_build_object(
         'security',
         jsonb_build_object(
           'two_factor',
           jsonb_build_object('enabled', true, 'required_for_admins', true)
         )
       ),
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE is_active = true
);
