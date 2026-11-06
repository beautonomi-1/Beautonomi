-- ============================================================================
-- 10118: Admin MFA — all roles with grace period (enforce_all_from)
-- ============================================================================
-- Sets two_factor.required_roles to [] (empty = all admin roles per api-helpers).
-- Adds enforce_all_from ISO date ~30 days from migration apply for grace banner.

UPDATE public.platform_settings
SET settings = jsonb_set(
      jsonb_set(
        CASE
          WHEN settings ? 'security' THEN settings
          ELSE settings || jsonb_build_object('security', '{}'::jsonb)
        END,
        '{security,two_factor,required_roles}',
        '[]'::jsonb,
        true
      ),
      '{security,two_factor,enforce_all_from}',
      to_jsonb((NOW() + INTERVAL '30 days')::date::text),
      true
    ),
    updated_at = NOW()
WHERE is_active = true;

INSERT INTO public.platform_settings (settings, is_active)
SELECT jsonb_build_object(
         'security',
         jsonb_build_object(
           'two_factor',
           jsonb_build_object(
             'enabled', true,
             'required_for_admins', true,
             'required_roles', '[]'::jsonb,
             'enforce_all_from', (NOW() + INTERVAL '30 days')::date::text
           )
         )
       ),
       true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE is_active = true);
