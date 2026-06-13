-- 675: Purge hardening — ai_cache provider rows + diagnose direct users/auth FK blockers.
--
-- ai_cache uses key_hash PK (not id) and provider_id REFERENCES providers without ON DELETE,
-- so it must be cleared explicitly before provider CASCADE. Also extend the diagnostic to
-- report direct RESTRICT/NO ACTION rows pointing at the target user id (not only closure).

CREATE OR REPLACE FUNCTION public.compliance_diagnose_user_delete_blockers(p_user_id UUID)
RETURNS TABLE (
  table_schema TEXT,
  table_name TEXT,
  column_name TEXT,
  constraint_name TEXT,
  delete_action TEXT,
  blocking_rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _fk RECORD;
  _iter INT := 0;
  _progress BIGINT;
  _n BIGINT;
  _cnt BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _compliance_doomed_dx (
    rel_oid OID NOT NULL,
    id_text TEXT NOT NULL,
    PRIMARY KEY (rel_oid, id_text)
  ) ON COMMIT DROP;
  TRUNCATE _compliance_doomed_dx;

  INSERT INTO _compliance_doomed_dx (rel_oid, id_text)
  VALUES
    ('public.users'::regclass::oid, p_user_id::text),
    ('auth.users'::regclass::oid, p_user_id::text)
  ON CONFLICT DO NOTHING;

  LOOP
    _iter := _iter + 1;
    EXIT WHEN _iter > 100;
    _progress := 0;

    FOR _fk IN
      SELECT con.conrelid AS child_oid,
             con.confrelid AS parent_oid,
             child_col.attname AS child_col
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_attribute child_col
        ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_attribute parent_col
        ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1
        AND array_length(con.confkey, 1) = 1
        AND con.confdeltype = 'c'
        AND parent_col.attname = 'id'
        AND child_ns.nspname = 'public'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = con.conrelid AND a.attname = 'id' AND NOT a.attisdropped
        )
    LOOP
      EXECUTE format(
        'INSERT INTO _compliance_doomed_dx (rel_oid, id_text)
           SELECT %L::oid, c.id::text FROM %s c
            WHERE c.%I::text IN (SELECT id_text FROM _compliance_doomed_dx WHERE rel_oid = %L::oid)
         ON CONFLICT DO NOTHING',
        _fk.child_oid, _fk.child_oid::regclass, _fk.child_col, _fk.parent_oid
      );
      GET DIAGNOSTICS _n = ROW_COUNT;
      _progress := _progress + _n;
    END LOOP;

    EXIT WHEN _progress = 0;
  END LOOP;

  -- RESTRICT / NO ACTION children referencing rows in the auth-delete cascade closure.
  FOR _fk IN
    SELECT child_ns.nspname AS cschema,
           child.relname AS ctable,
           child_col.attname AS ccol,
           con.conname AS cname,
           con.confdeltype AS cact,
           con.conrelid AS child_oid,
           con.confrelid AS parent_oid
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_attribute child_col
      ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND con.confdeltype IN ('a', 'r')
      AND parent_col.attname = 'id'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s WHERE %I::text IN (SELECT id_text FROM _compliance_doomed_dx WHERE rel_oid = %L::oid)',
      _fk.child_oid::regclass, _fk.ccol, _fk.parent_oid
    ) INTO _cnt;

    IF _cnt > 0 THEN
      table_schema := _fk.cschema;
      table_name := _fk.ctable;
      column_name := _fk.ccol;
      constraint_name := _fk.cname;
      delete_action := CASE _fk.cact WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' ELSE _fk.cact::text END;
      blocking_rows := _cnt;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Direct RESTRICT / NO ACTION rows pointing at the target user id (auth.users / public.users).
  FOR _fk IN
    SELECT child_ns.nspname AS cschema,
           child.relname AS ctable,
           child_col.attname AS ccol,
           con.conname AS cname,
           con.confdeltype AS cact,
           con.conrelid AS child_oid
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_attribute child_col
      ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND con.confdeltype IN ('a', 'r')
      AND parent_col.attname = 'id'
      AND (
        (parent_ns.nspname = 'public' AND parent.relname = 'users')
        OR (parent_ns.nspname = 'auth' AND parent.relname = 'users')
      )
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s WHERE %I = $1',
      _fk.child_oid::regclass, _fk.ccol
    ) INTO _cnt USING p_user_id;

    IF _cnt > 0 THEN
      table_schema := _fk.cschema;
      table_name := _fk.ctable;
      column_name := _fk.ccol;
      constraint_name := _fk.cname;
      delete_action := CASE _fk.cact WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' ELSE _fk.cact::text END;
      blocking_rows := _cnt;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) IS
  'Read-only: RESTRICT/NO ACTION blockers for auth delete — cascade closure refs plus direct public.users/auth.users FK rows.';

-- Re-apply clear RPC with explicit ai_cache / ai_usage_log provider cleanup in pass 1.
-- (Full body matches 674 + two extra guarded statements at the start of pass 1.)
CREATE OR REPLACE FUNCTION public.compliance_clear_user_references(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _stmt TEXT;
  _fk RECORD;
  _blocker RECORD;
  _iter INT := 0;
  _progress BIGINT;
  _n BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  FOREACH _stmt IN ARRAY ARRAY[
    'DELETE FROM ai_cache WHERE provider_id IN (SELECT id FROM providers WHERE user_id = $1)',
    'DELETE FROM ai_usage_log WHERE provider_id IN (SELECT id FROM providers WHERE user_id = $1)',
    'DELETE FROM product_order_items WHERE order_id IN (SELECT id FROM product_orders WHERE provider_id IN (SELECT id FROM providers WHERE user_id = $1))',
    'UPDATE user_referrals SET booking_id = NULL WHERE booking_id IN (SELECT b.id FROM bookings b INNER JOIN providers p ON p.id = b.provider_id WHERE p.user_id = $1)',
    'UPDATE group_bookings SET primary_contact_booking_id = NULL WHERE primary_contact_booking_id IN (SELECT b.id FROM bookings b INNER JOIN providers p ON p.id = b.provider_id WHERE p.user_id = $1)',
    'DELETE FROM bookings WHERE provider_id IN (SELECT id FROM providers WHERE user_id = $1)'
  ]
  LOOP
    BEGIN
      EXECUTE _stmt USING p_user_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;
  END LOOP;

  FOR _fk IN
    SELECT
      child_ns.nspname AS table_schema,
      child.relname AS table_name,
      child_col.attname AS column_name,
      parent.relname AS parent_table,
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
      AND parent_ns.nspname = 'public'
      AND parent.relname IN ('providers', 'offerings')
      AND parent_col.attname = 'id'
      AND con.confdeltype IN ('a', 'r')
      AND child.relname NOT IN ('providers', 'offerings')
    ORDER BY parent.relname ASC, child_ns.nspname, child.relname, child_col.attname
  LOOP
    BEGIN
      IF _fk.parent_table = 'offerings' THEN
        _stmt := format(
          'DELETE FROM %I.%I WHERE %I IN (SELECT o.id FROM offerings o INNER JOIN providers p ON p.id = o.provider_id WHERE p.user_id = $1)',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name
        );
      ELSE
        _stmt := format(
          'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM providers WHERE user_id = $1)',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name
        );
      END IF;

      EXECUTE _stmt USING p_user_id;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        NULL;
      WHEN foreign_key_violation THEN
        RAISE EXCEPTION
          'Could not clear provider purge FK blocker %.%.% -> % (constraint %)',
          _fk.table_schema,
          _fk.table_name,
          _fk.column_name,
          _fk.parent_table,
          _fk.constraint_name
          USING ERRCODE = '23503';
    END;
  END LOOP;

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

  CREATE TEMP TABLE IF NOT EXISTS _compliance_doomed (
    rel_oid OID NOT NULL,
    id_text TEXT NOT NULL,
    PRIMARY KEY (rel_oid, id_text)
  ) ON COMMIT DROP;
  TRUNCATE _compliance_doomed;

  INSERT INTO _compliance_doomed (rel_oid, id_text)
  VALUES
    ('public.users'::regclass::oid, p_user_id::text),
    ('auth.users'::regclass::oid, p_user_id::text)
  ON CONFLICT DO NOTHING;

  _iter := 0;
  LOOP
    _iter := _iter + 1;
    EXIT WHEN _iter > 100;
    _progress := 0;

    FOR _fk IN
      SELECT con.conrelid AS child_oid,
             con.confrelid AS parent_oid,
             child_col.attname AS child_col
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_attribute child_col
        ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_attribute parent_col
        ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1
        AND array_length(con.confkey, 1) = 1
        AND con.confdeltype = 'c'
        AND parent_col.attname = 'id'
        AND child_ns.nspname = 'public'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = con.conrelid AND a.attname = 'id' AND NOT a.attisdropped
        )
    LOOP
      _stmt := format(
        'INSERT INTO _compliance_doomed (rel_oid, id_text)
           SELECT %L::oid, c.id::text FROM %s c
            WHERE c.%I::text IN (SELECT id_text FROM _compliance_doomed WHERE rel_oid = %L::oid)
         ON CONFLICT DO NOTHING',
        _fk.child_oid, _fk.child_oid::regclass, _fk.child_col, _fk.parent_oid
      );
      EXECUTE _stmt;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _progress := _progress + _n;
    END LOOP;

    FOR _fk IN
      SELECT con.conrelid AS child_oid,
             con.confrelid AS parent_oid,
             child_col.attname AS child_col,
             EXISTS (
               SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = con.conrelid AND a.attname = 'id' AND NOT a.attisdropped
             ) AS child_has_id
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_attribute child_col
        ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_attribute parent_col
        ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1
        AND array_length(con.confkey, 1) = 1
        AND con.confdeltype IN ('a', 'r')
        AND parent_col.attname = 'id'
        AND child_ns.nspname = 'public'
    LOOP
      IF _fk.child_has_id THEN
        BEGIN
          _stmt := format(
            'INSERT INTO _compliance_doomed (rel_oid, id_text)
               SELECT %L::oid, c.id::text FROM %s c
                WHERE c.%I::text IN (SELECT id_text FROM _compliance_doomed WHERE rel_oid = %L::oid)
             ON CONFLICT DO NOTHING',
            _fk.child_oid, _fk.child_oid::regclass, _fk.child_col, _fk.parent_oid
          );
          EXECUTE _stmt;
          GET DIAGNOSTICS _n = ROW_COUNT;
          _progress := _progress + _n;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      BEGIN
        _stmt := format(
          'DELETE FROM %s WHERE %I::text IN (SELECT id_text FROM _compliance_doomed WHERE rel_oid = %L::oid)',
          _fk.child_oid::regclass, _fk.child_col, _fk.parent_oid
        );
        EXECUTE _stmt;
        GET DIAGNOSTICS _n = ROW_COUNT;
        _progress := _progress + _n;
      EXCEPTION
        WHEN foreign_key_violation THEN
          NULL;
        WHEN undefined_table OR undefined_column THEN
          NULL;
      END;
    END LOOP;

    EXIT WHEN _progress = 0;
  END LOOP;

  FOR _blocker IN
    SELECT *
    FROM public.compliance_diagnose_user_delete_blockers(p_user_id)
  LOOP
    RAISE EXCEPTION
      'Residual user purge FK blocker %.%.% (constraint %, %, % row(s))',
      _blocker.table_schema,
      _blocker.table_name,
      _blocker.column_name,
      _blocker.constraint_name,
      _blocker.delete_action,
      _blocker.blocking_rows
      USING ERRCODE = '23503';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) TO service_role;
