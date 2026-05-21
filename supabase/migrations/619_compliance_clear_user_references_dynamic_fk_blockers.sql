-- Harden compliance user purge against newly-added FK blockers.
--
-- Supabase Auth deletes from auth.users. If any public table has a NO ACTION or
-- RESTRICT FK to auth.users(id) or public.users(id), Auth surfaces only:
-- "Database error deleting user". Keep the known explicit cleanup statements,
-- then dynamically clear every single-column FK blocker in public so future
-- tables do not silently break compliance purge again.

CREATE OR REPLACE FUNCTION public.compliance_clear_user_references(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _stmt TEXT;
  _fk RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Known historical blockers. Each statement is guarded so tenant databases at
  -- different migration depths can still run this RPC successfully.
  FOREACH _stmt IN ARRAY ARRAY[
    'DELETE FROM booking_audit_log WHERE created_by = $1',
    'DELETE FROM additional_charges WHERE requested_by = $1',
    'UPDATE booking_holds SET created_by_user_id = NULL WHERE created_by_user_id = $1',
    'UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = $1',
    'UPDATE staff_time_off SET approved_by = NULL WHERE approved_by = $1',
    'UPDATE time_blocks SET created_by = NULL WHERE created_by = $1',
    'UPDATE users SET referred_by = NULL WHERE referred_by = $1',
    'UPDATE users SET identity_verification_reviewed_by = NULL WHERE identity_verification_reviewed_by = $1',
    'UPDATE user_verifications SET reviewed_by = NULL WHERE reviewed_by = $1',
    'DELETE FROM ai_usage_log WHERE actor_user_id = $1',
    'DELETE FROM report_schedules WHERE created_by = $1',
    'DELETE FROM payment_fee_adjustments WHERE created_by = $1',
    'UPDATE payment_fee_adjustments SET reconciled_by = NULL WHERE reconciled_by = $1',
    'DELETE FROM fee_reconciliations WHERE created_by = $1',
    'UPDATE fee_reconciliations SET reviewed_by = NULL WHERE reviewed_by = $1',
    'UPDATE payment_gateway_fee_configs SET created_by = NULL WHERE created_by = $1',
    'UPDATE payment_gateway_fee_configs SET updated_by = NULL WHERE updated_by = $1',
    'UPDATE product_return_requests SET resolved_by = NULL WHERE resolved_by = $1',
    'UPDATE product_orders SET staff_id = NULL WHERE staff_id = $1',
    'UPDATE booking_payments SET created_by = NULL WHERE created_by = $1',
    'UPDATE booking_refunds SET created_by = NULL WHERE created_by = $1',
    'UPDATE explore_posts SET created_by_user_id = NULL WHERE created_by_user_id = $1',
    'UPDATE sales SET created_by = NULL WHERE created_by = $1',
    'UPDATE email_templates SET created_by = NULL WHERE created_by = $1',
    'UPDATE sms_templates SET created_by = NULL WHERE created_by = $1',
    'UPDATE email_template_versions SET created_by = NULL WHERE created_by = $1',
    'UPDATE sms_template_versions SET created_by = NULL WHERE created_by = $1',
    'UPDATE webhook_endpoints SET created_by = NULL WHERE created_by = $1',
    'UPDATE system_health_api_keys SET created_by = NULL WHERE created_by = $1',
    'UPDATE feature_flags SET created_by = NULL WHERE created_by = $1',
    'UPDATE feature_flags SET updated_by = NULL WHERE updated_by = $1',
    'UPDATE amplitude_integration_config SET created_by = NULL WHERE created_by = $1',
    'UPDATE amplitude_integration_config SET updated_by = NULL WHERE updated_by = $1',
    'UPDATE profile_questions SET created_by = NULL WHERE created_by = $1',
    'UPDATE profile_questions SET updated_by = NULL WHERE updated_by = $1',
    'UPDATE platform_zones SET created_by = NULL WHERE created_by = $1',
    'UPDATE config_change_log SET changed_by = NULL WHERE changed_by = $1'
  ]
  LOOP
    BEGIN
      EXECUTE _stmt USING p_user_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;
  END LOOP;

  -- Future-proof cleanup: process every public single-column FK to users whose
  -- delete action will not be handled by the database itself.
  FOR _fk IN
    SELECT
      child_ns.nspname AS table_schema,
      child.relname AS table_name,
      child_col.attname AS column_name,
      child_col.attnotnull AS column_not_null,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_attribute child_col
      ON child_col.attrelid = con.conrelid
     AND child_col.attnum = con.conkey[1]
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = con.confrelid
     AND parent_col.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND child_ns.nspname = 'public'
      AND parent_col.attname = 'id'
      AND (
        (parent_ns.nspname = 'public' AND parent.relname = 'users')
        OR (parent_ns.nspname = 'auth' AND parent.relname = 'users')
      )
      -- 'a' = NO ACTION, 'r' = RESTRICT. Cascades and SET NULL are left for
      -- the database/Auth delete path so attachment cleanup can still inspect
      -- user-owned rows before the final auth deletion.
      AND con.confdeltype IN ('a', 'r')
    ORDER BY child_col.attnotnull ASC, child_ns.nspname, child.relname, child_col.attname
  LOOP
    BEGIN
      IF _fk.column_not_null THEN
        _stmt := format(
          'DELETE FROM %I.%I WHERE %I = $1',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name
        );
      ELSE
        _stmt := format(
          'UPDATE %I.%I SET %I = NULL WHERE %I = $1',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name,
          _fk.column_name
        );
      END IF;

      EXECUTE _stmt USING p_user_id;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        NULL;
      WHEN foreign_key_violation THEN
        RAISE EXCEPTION
          'Could not clear user purge FK blocker %.%.% (constraint %)',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name,
          _fk.constraint_name
          USING ERRCODE = '23503';
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.compliance_clear_user_references(UUID) IS
  'Superadmin compliance: clear FK blockers before auth.admin.deleteUser. Dynamically handles public single-column NO ACTION/RESTRICT FKs to public.users/auth.users.';

REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_clear_user_references(UUID) TO service_role;
