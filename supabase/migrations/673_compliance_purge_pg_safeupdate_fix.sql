-- 673: Fix compliance purge RPCs failing on Supabase with "DELETE requires a WHERE clause".
--
-- Migration 670 cleared session temp tables via unqualified DELETE, which pg_safeupdate
-- (enabled on hosted Supabase) rejects. Use TRUNCATE on the temp closure tables instead.

----------------------------------------------------------------------
-- Generic deep blocker clear, appended to the existing RPC behaviour.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_clear_user_references(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _stmt TEXT;
  _fk RECORD;
  _iter INT := 0;
  _progress BIGINT;
  _n BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- ── Pass 1: provider-owned transactional data that blocks provider → offerings.
  FOREACH _stmt IN ARRAY ARRAY[
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

  -- ── Pass 2: known historical direct-user blockers (kept for determinism).
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

  -- ── Pass 3: GENERIC deep cascade-closure blocker clear.
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
END;
$$;

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
END;
$$;
