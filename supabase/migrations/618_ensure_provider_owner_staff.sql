-- 618_ensure_provider_owner_staff.sql
--
-- Ensures every provider (freelancer OR salon) has an owner `provider_staff`
-- row so that:
--   • The mobile staff-schedule and calendar screens always have at least one
--     bookable staff member.
--   • `/api/provider/shifts` fallback logic can synthesise availability rows
--     for the owner when no explicit `staff_schedules` rows exist.
--
-- Complements `ensure_freelancer_staff` (migration 072) which is freelancer-
-- only.  This function is intentionally idempotent (INSERT … ON CONFLICT DO
-- UPDATE) so it is safe to call multiple times or to backfill existing rows.

CREATE OR REPLACE FUNCTION ensure_provider_owner_staff(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id     UUID;
  v_user_name   TEXT;
  v_user_email  TEXT;
  v_user_phone  TEXT;
  v_biz_type    TEXT;
  v_staff_id    UUID;
  v_created     BOOLEAN := false;
BEGIN
  -- Resolve provider → user metadata
  SELECT p.user_id, p.business_type,
         u.full_name, u.email, u.phone
  INTO   v_user_id, v_biz_type,
         v_user_name, v_user_email, v_user_phone
  FROM   providers p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE  p.id = p_provider_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found: %', p_provider_id;
  END IF;

  -- Upsert owner staff row.  ON CONFLICT keeps the existing row but refreshes
  -- name/email/phone and ensures is_active = true.  mobile_ready is set only
  -- for freelancer (mobile) providers to preserve the existing flag semantics.
  INSERT INTO provider_staff (
    provider_id,
    user_id,
    name,
    email,
    phone,
    role,
    is_active,
    mobile_ready,
    created_at,
    updated_at
  )
  VALUES (
    p_provider_id,
    v_user_id,
    COALESCE(v_user_name, 'Owner'),
    v_user_email,
    v_user_phone,
    'owner',
    true,
    (v_biz_type = 'freelancer'),
    NOW(),
    NOW()
  )
  ON CONFLICT (provider_id, user_id)
  DO UPDATE SET
    role         = EXCLUDED.role,
    is_active    = true,
    mobile_ready = CASE
                     WHEN EXCLUDED.mobile_ready = true THEN true
                     ELSE provider_staff.mobile_ready
                   END,
    name         = COALESCE(EXCLUDED.name, provider_staff.name),
    email        = COALESCE(EXCLUDED.email, provider_staff.email),
    phone        = COALESCE(EXCLUDED.phone, provider_staff.phone),
    updated_at   = NOW()
  RETURNING id, (xmax = 0) AS is_new_row
  INTO v_staff_id, v_created;

  RETURN jsonb_build_object(
    'success',    true,
    'provider_id', p_provider_id,
    'staff_id',    v_staff_id,
    'created',     v_created,
    'business_type', v_biz_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION ensure_provider_owner_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_provider_owner_staff(UUID) TO service_role;

COMMENT ON FUNCTION ensure_provider_owner_staff IS
  'Upserts the owner provider_staff row for any provider type (freelancer or salon). '
  'Safe to call multiple times; no-ops when the row already exists with correct data.';

-- Backfill existing providers that have no owner staff row at all.
DO $$
DECLARE
  v_provider RECORD;
BEGIN
  FOR v_provider IN
    SELECT p.id
    FROM   providers p
    WHERE  NOT EXISTS (
      SELECT 1
      FROM   provider_staff ps
      WHERE  ps.provider_id = p.id
        AND  ps.user_id = p.user_id
        AND  ps.role = 'owner'
    )
  LOOP
    BEGIN
      PERFORM ensure_provider_owner_staff(v_provider.id);
    EXCEPTION WHEN OTHERS THEN
      -- Log but do not abort the migration for a single bad row.
      RAISE WARNING 'ensure_provider_owner_staff failed for provider %: %',
        v_provider.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
