-- 670: Compliance user purge — clear TRANSITIVE FK blockers (deep cascade closure).
--
-- Problem: `auth.admin.deleteUser` deletes auth.users, which CASCADE-deletes
-- public.users (002) and, in turn, CASCADE-deletes providers (003) → offerings,
-- locations, products, subscriptions, ads_campaigns, etc. If ANY table further
-- down those CASCADE chains has a RESTRICT / NO ACTION foreign key to a row that
-- is about to be deleted, Postgres aborts and Supabase Auth surfaces only the
-- opaque "Database error deleting user".
--
-- The previous cleanup (619 / 631 / 653) only cleared:
--   • direct single-column FKs to users / auth.users, and
--   • direct children of providers / offerings.
-- It did NOT clear deeper grandchildren (e.g. providers → products →
-- product_order_items, or providers → ads_campaigns → ads_budget_orders when
-- those use RESTRICT), so a deep blocker still aborted the purge.
--
-- Fix: after the existing targeted passes, run a generic closure-based sweep:
--   1. Build the set of rows the DB cascade WILL delete, starting from
--      public.users(p_user_id) and following every ON DELETE CASCADE edge whose
--      referenced column is `id` (the universal PK in this schema).
--   2. For every RESTRICT / NO ACTION FK whose parent row is in that doomed set,
--      record the child rows (so their own descendants resolve next pass) and
--      DELETE them. FK violations during a delete are deferred to a later pass so
--      multi-level chains unwind deepest-first without us hand-ordering tables.
--   3. Repeat to a fixpoint.
-- Blast radius is strictly the target user's cascade graph (only rows that
-- reference a doomed row are touched), and deletes are confined to schema public.
--
-- Also adds a read-only diagnostic, `compliance_diagnose_user_delete_blockers`,
-- so any *remaining* blocker is reported by table/column/constraint instead of
-- the opaque auth error.

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
  -- _compliance_doomed holds (table oid, id::text) for every row the auth
  -- cascade will delete. Seeded with the public.users row (CASCADE from
  -- auth.users per migration 002).
  CREATE TEMP TABLE IF NOT EXISTS _compliance_doomed (
    rel_oid OID NOT NULL,
    id_text TEXT NOT NULL,
    PRIMARY KEY (rel_oid, id_text)
  ) ON COMMIT DROP;
  TRUNCATE _compliance_doomed;

  -- Seed both the auth and public rows: public.users.id == auth.users.id, but FKs
  -- target one OID or the other, so both must be present for child matching.
  INSERT INTO _compliance_doomed (rel_oid, id_text)
  VALUES
    ('public.users'::regclass::oid, p_user_id::text),
    ('auth.users'::regclass::oid, p_user_id::text)
  ON CONFLICT DO NOTHING;

  LOOP
    _iter := _iter + 1;
    EXIT WHEN _iter > 100;
    _progress := 0;

    -- (A) Expand the closure across ON DELETE CASCADE edges. Only follow FKs that
    -- reference a parent `id` column and whose child table also has an `id`
    -- column (so the new rows are trackable for the next level).
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

    -- (B) Clear every RESTRICT / NO ACTION child that references a doomed row.
    -- Record trackable children first so their descendants resolve next pass,
    -- then delete. FK violations (a deeper child not yet cleared) are deferred.
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
          -- A deeper RESTRICT child still references these rows; it was recorded
          -- above and will be cleared on a subsequent pass. Defer this delete.
          NULL;
        WHEN undefined_table OR undefined_column THEN
          NULL;
      END;
    END LOOP;

    EXIT WHEN _progress = 0;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.compliance_clear_user_references(UUID) IS
  'Superadmin compliance: clear FK blockers before auth.admin.deleteUser. Runs explicit provider-booking/known-user passes, then a generic deep cascade-closure sweep that removes every transitive RESTRICT/NO ACTION blocker in schema public referencing the target user''s delete graph.';

REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_clear_user_references(UUID) TO service_role;

----------------------------------------------------------------------
-- Read-only diagnostic: report any rows that would still block the
-- auth delete, by table / column / constraint / count. Never mutates.
----------------------------------------------------------------------
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

  -- Build the (read-only) cascade closure.
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

  -- Report RESTRICT / NO ACTION children that still reference doomed rows.
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

COMMENT ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) IS
  'Read-only: lists tables/columns/constraints whose RESTRICT/NO ACTION rows still reference the target user''s auth-delete cascade closure. Used to explain an opaque "Database error deleting user".';

REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_diagnose_user_delete_blockers(UUID) TO service_role;
