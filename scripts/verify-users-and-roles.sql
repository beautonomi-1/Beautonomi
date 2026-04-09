-- =============================================================================
-- Verify users, platform roles, provider/customer linkage, and tenant scope
-- =============================================================================
--
-- Run in Supabase SQL Editor or psql with a role that can read:
--   public.*, auth.users
-- (Dashboard SQL editor uses sufficient privileges; RLS does not apply to
--  postgres / dashboard in the same way — use service role if querying via API.)
--
-- Sections:
--   (1) Counts by platform role (public.users.role)
--   (2) Optional: enum values for user_role
--   (3) Full user audit (one row per public user)
--   (4) Integrity checks (should return 0 rows where noted)
--   (5) Auth vs public profile consistency
--
-- If `user_tenant_roles` or `tenants` is missing in your DB branch, comment out
-- the lateral block marked [TENANT_ROLES] in section (3) and the related checks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) Counts by platform role
-- -----------------------------------------------------------------------------
SELECT u.role AS platform_role, COUNT(*)::bigint AS user_count
FROM public.users u
GROUP BY u.role
ORDER BY user_count DESC, platform_role;

-- -----------------------------------------------------------------------------
-- (2) user_role enum labels (PostgreSQL)
-- -----------------------------------------------------------------------------
SELECT e.enumlabel AS user_role_enum_value
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'user_role'
ORDER BY e.enumsortorder;

-- -----------------------------------------------------------------------------
-- (3) Detailed user audit — core identity, tenant, provider ownership, staff
-- -----------------------------------------------------------------------------
SELECT
  u.id,
  u.email,
  u.full_name,
  u.preferred_name,
  u.phone,
  u.role AS platform_role,
  u.signup_source,
  u.preferred_home_tenant_id,
  t.slug AS preferred_tenant_slug,
  t.name AS preferred_tenant_name,
  u.preferred_currency,
  u.timezone,
  u.preferred_language,
  u.email_verified,
  u.phone_verified,
  u.identity_verification_status,
  u.identity_verified,
  u.handle,
  u.referral_code,
  u.referred_by,
  u.rating_average AS combined_rating_avg,
  u.review_count AS combined_review_count,
  u.last_login_at AS users_last_login_at,
  au.last_sign_in_at AS auth_last_sign_in_at,
  au.email_confirmed_at,
  au.created_at AS auth_created_at,
  u.created_at AS public_created_at,
  u.account_deletion_requested_at,
  own.id AS owned_provider_id,
  own.slug AS owned_provider_slug,
  own.business_name AS owned_business_name,
  own.status AS owned_provider_status,
  own.subscription_status AS owned_subscription_status,
  w.currency AS wallet_currency,
  w.balance AS wallet_balance,
  staff.staff_memberships,
  utr_agg.tenant_roles
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN public.tenants t ON t.id = u.preferred_home_tenant_id
LEFT JOIN public.providers own ON own.user_id = u.id
LEFT JOIN public.user_wallets w ON w.user_id = u.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'provider_id', ps.provider_id,
      'business_name', pr.business_name,
      'slug', pr.slug,
      'staff_role', ps.role,
      'is_active', ps.is_active,
      'role_id', ps.role_id
    )
    ORDER BY pr.business_name
  ) AS staff_memberships
  FROM public.provider_staff ps
  JOIN public.providers pr ON pr.id = ps.provider_id
  WHERE ps.user_id = u.id
) staff ON true
LEFT JOIN LATERAL (
  -- [TENANT_ROLES] — comment this LATERAL out if `user_tenant_roles` is absent
  SELECT jsonb_agg(
    jsonb_build_object(
      'tenant_id', utr.tenant_id,
      'tenant_slug', tn.slug,
      'role', utr.role,
      'is_active', utr.is_active
    )
    ORDER BY tn.slug
  ) AS tenant_roles
  FROM public.user_tenant_roles utr
  JOIN public.tenants tn ON tn.id = utr.tenant_id
  WHERE utr.user_id = u.id
) utr_agg ON true
ORDER BY u.created_at DESC;

-- -----------------------------------------------------------------------------
-- (4) Integrity checks — review rows (non-empty = investigate)
-- -----------------------------------------------------------------------------

-- (4a) public.users rows with no matching auth.users (should be empty)
SELECT u.id, u.email, u.role, u.created_at
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.id
WHERE au.id IS NULL;

-- (4b) auth.users with no public.users row (should be empty after triggers)
SELECT au.id, au.email, au.created_at
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL;

-- (4c) provider_owner without an owned provider record (should be empty)
SELECT u.id, u.email, u.full_name, u.role, u.created_at
FROM public.users u
LEFT JOIN public.providers p ON p.user_id = u.id
WHERE u.role = 'provider_owner'
  AND p.id IS NULL;

-- (4d) Email mismatch: public.users.email vs auth.users.email (should be empty if kept in sync)
SELECT u.id, u.email AS public_email, au.email AS auth_email, u.role
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE lower(trim(u.email)) IS DISTINCT FROM lower(trim(au.email));

-- (4e) Optional: auth metadata role vs public.users.role (signup drift)
SELECT
  u.id,
  u.email,
  u.role AS public_role,
  au.raw_user_meta_data->>'role' AS auth_meta_role
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE au.raw_user_meta_data ? 'role'
  AND (au.raw_user_meta_data->>'role') IS NOT NULL
  AND (au.raw_user_meta_data->>'role') <> u.role::text;

-- (4f) Multiple active staff rows same provider for one user (normally at most one)
SELECT ps.user_id, ps.provider_id, COUNT(*)::bigint AS row_count
FROM public.provider_staff ps
WHERE ps.user_id IS NOT NULL
GROUP BY ps.user_id, ps.provider_id
HAVING COUNT(*) > 1;

-- -----------------------------------------------------------------------------
-- (5) Compact summary: customers vs providers vs admins (high level)
-- -----------------------------------------------------------------------------
SELECT
  CASE
    WHEN u.role::text = 'customer' THEN 'customer'
    WHEN u.role::text IN ('provider_owner', 'provider_staff', 'provider_onboarding') THEN 'provider_side'
    WHEN u.role::text IN (
      'superadmin',
      'support_agent',
      'admin_support',
      'admin_finance',
      'admin_trust',
      'admin_content',
      'admin_ecommerce',
      'admin_marketing',
      'admin_integrations',
      'admin_operations',
      'admin_platform_config'
    ) THEN 'platform_staff'
    ELSE 'other'
  END AS bucket,
  COUNT(*)::bigint AS n
FROM public.users u
GROUP BY 1
ORDER BY n DESC;
