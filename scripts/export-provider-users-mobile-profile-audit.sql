-- =============================================================================
-- Provider users — full name + auth + mobile app profile payload (audit export)
-- =============================================================================
--
-- WHO IS INCLUDED
--   Everyone linked to the provider product: platform role provider_owner /
--   provider_staff, OR a row in public.providers (owner), OR public.provider_staff.
--   (Covers users still stored as "customer" but owning a business — same as
--   /api/me/role provider-app overrides.)
--
-- MOBILE APP DATA SOURCES (apps/provider + apps/web API)
--   Session:        Supabase Auth (Bearer) — auth.users
--   Personal UI:    GET /api/me/profile — public.users, user_profiles, default
--                   user_addresses, latest user_verifications
--   Business UI:    GET /api/provider/profile — public.providers,
--                   provider_locations (active), tenant money locale
--   Role gate:      GET /api/me/role — public.users.role (+ staff/owner rules)
--   Portal routing: GET /api/me/portal — users.role, providers.status
--   Plan label:     GET /api/provider/subscription — provider_subscriptions +
--                   subscription_plans
--
-- SECURITY
--   This script selects auth.users fields needed for verification only.
--   It does NOT select encrypted_password, recovery/confirmation tokens, or
--   reauthentication secrets. Do not add those columns to exports.
--
-- RUN: Supabase SQL Editor or psql as a role that can read auth.users + public.
-- =============================================================================

WITH provider_linked AS (
  SELECT u.id
  FROM public.users u
  WHERE u.role IN ('provider_owner', 'provider_staff')
  UNION
  SELECT p.user_id AS id
  FROM public.providers p
  WHERE p.user_id IS NOT NULL
  UNION
  SELECT ps.user_id AS id
  FROM public.provider_staff ps
  WHERE ps.user_id IS NOT NULL
),
first_staff AS (
  SELECT DISTINCT ON (ps.user_id)
    ps.user_id,
    ps.provider_id,
    ps.role AS staff_role,
    ps.is_active AS staff_is_active,
    ps.id AS provider_staff_row_id,
    ps.created_at AS staff_created_at
  FROM public.provider_staff ps
  WHERE ps.is_active = true
  ORDER BY ps.user_id, ps.created_at ASC
),
effective_provider AS (
  SELECT
    pl.id AS user_id,
    COALESCE(po.id, fs.provider_id) AS provider_id_resolved
  FROM provider_linked pl
  LEFT JOIN public.providers po ON po.user_id = pl.id
  LEFT JOIN first_staff fs ON fs.user_id = pl.id
)
SELECT
  -- ── Identity (public.users) — also used by /api/me/profile ──────────────
  u.id,
  u.email,
  u.full_name,
  u.preferred_name,
  u.handle,
  u.phone,
  u.avatar_url,
  u.role::text AS platform_role,
  u.date_of_birth,
  u.preferred_language,
  u.preferred_currency,
  u.timezone AS user_timezone,
  u.preferred_home_tenant_id,
  u.signup_source,
  u.email_verified,
  u.phone_verified,
  u.identity_verified,
  u.identity_verification_status,
  u.identity_verification_submitted_at,
  u.identity_verification_reviewed_at,
  u.password_changed_at,
  u.deactivated_at,
  u.deactivation_reason,
  u.last_login_at AS users_table_last_login_at,
  u.created_at AS public_user_created_at,
  u.updated_at AS public_user_updated_at,
  u.referral_code,
  u.referred_by,
  u.emergency_contact_name,
  u.emergency_contact_phone,
  u.emergency_contact_relationship,
  u.emergency_contact_email,
  u.emergency_contact_country_code,

  -- ── Auth (auth.users) — session + verification timestamps ───────────────
  au.email AS auth_email,
  au.phone AS auth_phone,
  au.email_confirmed_at,
  au.phone_confirmed_at,
  au.last_sign_in_at,
  au.created_at AS auth_created_at,
  au.is_anonymous,
  au.banned_until,
  au.raw_user_meta_data AS auth_raw_user_meta_data,

  -- ── Portal / role helpers (same inputs as /api/me/portal) ───────────────
  po.id AS owned_provider_id,
  po.status AS owned_provider_status,
  ep.provider_id_resolved AS effective_provider_id_for_api,
  CASE
    WHEN u.role::text IN ('superadmin') OR u.role::text LIKE 'admin_%' THEN 'admin'
    WHEN u.role::text = 'customer' THEN 'customer'
    WHEN u.role::text IN ('provider_owner', 'provider_staff')
      AND po.status = 'active' THEN 'provider'
    WHEN u.role::text IN ('provider_owner', 'provider_staff')
      AND po.id IS NOT NULL
      AND po.status IN ('draft', 'pending_approval', 'suspended')
      THEN 'provider_onboarding'
    WHEN u.role::text IN ('provider_owner', 'provider_staff') THEN 'provider_onboarding'
    ELSE 'customer'
  END AS derived_portal_like_web,

  -- ── Owned business (public.providers) — GET /api/provider/profile core ──
  po.business_name,
  po.business_type,
  po.slug AS provider_slug,
  po.description AS provider_description,
  po.phone AS provider_business_phone,
  po.email AS provider_business_email,
  po.thumbnail_url AS provider_thumbnail_url,
  po.avatar_url AS provider_avatar_url,
  po.tenant_id AS provider_tenant_id,
  po.timezone AS provider_timezone,
  po.status AS provider_status,
  po.is_verified AS provider_is_verified,
  po.currency AS provider_currency_column,
  po.subscription_status AS provider_subscription_status_column,
  po.subscription_expires_at,

  tprov.slug AS provider_tenant_slug,
  tprov.name AS provider_tenant_name,
  tprov.default_currency AS tenant_default_currency,
  tprov.default_timezone AS tenant_default_timezone,
  tprov.lifecycle AS tenant_lifecycle,

  -- Org row for the effective provider (matches getProviderIdForUser); fills
  -- when the user is staff-only and has no owned providers row.
  p_eff.id AS effective_org_provider_id,
  p_eff.business_name AS effective_org_business_name,
  p_eff.slug AS effective_org_slug,
  p_eff.status AS effective_org_status,
  t_eff.slug AS effective_org_tenant_slug,
  t_eff.default_currency AS effective_org_tenant_default_currency,

  -- ── Staff membership(s) — salon role + permissions ─────────────────────
  fs.staff_role AS first_active_staff_role,
  fs.provider_staff_row_id,
  staff_all.staff_memberships_json,

  -- ── Active locations for effective provider (same rows as /api/provider/profile)
  locs.locations_json,

  -- ── Subscription (effective org) — GET /api/provider/subscription ───────
  sub.provider_subscription_row_id,
  sub.subscription_row_status,
  sub.subscription_row_expires_at,
  sub.subscription_plan_id,
  sub.subscription_plan_name,
  sub.subscription_plan_slug,
  sub.subscription_plan_currency,
  sub.subscription_plan_price_monthly,

  -- ── Extended profile — GET /api/me/profile + profile-bundle ─────────────
  up.id AS user_profiles_row_id,
  up.about AS profile_about,
  up.interests AS profile_interests,
  up.beauty_preferences,
  up.privacy_settings,
  up.tax_info,
  up.vat_id AS profile_vat_id,
  up.notification_preferences AS profile_notification_preferences,

  -- ── Default address — /api/me/profile "address" ─────────────────────────
  ua.id AS default_address_id,
  ua.label AS default_address_label,
  ua.address_line1 AS default_address_line1,
  ua.address_line2 AS default_address_line2,
  ua.city AS default_address_city,
  ua.state AS default_address_state,
  ua.postal_code AS default_address_postal_code,
  ua.country AS default_address_country,

  -- ── Latest ID verification row — /api/me/profile verification block ───
  uv.id AS user_verification_id,
  uv.status AS user_verification_status,
  uv.submitted_at AS user_verification_submitted_at,
  uv.rejection_reason AS user_verification_rejection_reason,
  uv.document_type AS user_verification_document_type,
  uv.document_url AS user_verification_document_url,

  -- ── Wallet (often shown in account flows) ───────────────────────────────
  uw.balance AS wallet_balance,
  uw.currency AS wallet_currency

FROM provider_linked pl
JOIN public.users u ON u.id = pl.id
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN public.providers po ON po.user_id = u.id
LEFT JOIN effective_provider ep ON ep.user_id = u.id
LEFT JOIN public.providers p_eff ON p_eff.id = ep.provider_id_resolved
LEFT JOIN public.tenants t_eff ON t_eff.id = p_eff.tenant_id
LEFT JOIN public.tenants tprov ON tprov.id = po.tenant_id
LEFT JOIN first_staff fs ON fs.user_id = u.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'provider_id', ps.provider_id,
      'provider_staff_id', ps.id,
      'staff_role', ps.role,
      'is_active', ps.is_active,
      'permissions', ps.permissions,
      'role_id', ps.role_id
    )
    ORDER BY ps.created_at
  ) AS staff_memberships_json
  FROM public.provider_staff ps
  WHERE ps.user_id = u.id
) staff_all ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pl.id,
      'name', pl.name,
      'address_line1', pl.address_line1,
      'city', pl.city,
      'location_type', pl.location_type,
      'is_primary', pl.is_primary,
      'working_hours', pl.working_hours
    )
    ORDER BY pl.is_primary DESC, pl.created_at ASC
  ) AS locations_json
  FROM public.provider_locations pl
  WHERE pl.provider_id = ep.provider_id_resolved
    AND pl.is_active = true
) locs ON ep.provider_id_resolved IS NOT NULL
LEFT JOIN LATERAL (
  SELECT
    psub.id AS provider_subscription_row_id,
    psub.status AS subscription_row_status,
    psub.expires_at AS subscription_row_expires_at,
    sp.id AS subscription_plan_id,
    sp.name AS subscription_plan_name,
    sp.slug AS subscription_plan_slug,
    sp.currency AS subscription_plan_currency,
    sp.price_monthly AS subscription_plan_price_monthly
  FROM public.provider_subscriptions psub
  LEFT JOIN public.subscription_plans sp ON sp.id = psub.plan_id
  WHERE psub.provider_id = ep.provider_id_resolved
  ORDER BY
    CASE WHEN psub.status = 'active' THEN 0 ELSE 1 END,
    psub.created_at DESC NULLS LAST
  LIMIT 1
) sub ON true
LEFT JOIN public.user_profiles up ON up.user_id = u.id
LEFT JOIN public.user_addresses ua
  ON ua.user_id = u.id AND ua.is_default = true
LEFT JOIN LATERAL (
  SELECT uv.*
  FROM public.user_verifications uv
  WHERE uv.user_id = u.id
  ORDER BY uv.submitted_at DESC NULLS LAST
  LIMIT 1
) uv ON true
LEFT JOIN public.user_wallets uw ON uw.user_id = u.id
ORDER BY u.created_at DESC;

-- -----------------------------------------------------------------------------
-- Optional: if your DB has user_profiles.business_preferences (migration 246+)
-- add to the SELECT list above:
--   up.business_preferences,
-- -----------------------------------------------------------------------------
