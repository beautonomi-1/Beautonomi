-- Tests for 10141_finance_audit_run_allowlist.sql (F2-32)
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

DO $$
DECLARE v_row jsonb;
BEGIN
  SELECT * INTO v_row FROM public.finance_audit_run('ping');
  PERFORM pg_temp.audit_assert(v_row->>'ok' = '1', 'F2-32 ping returns ok');
END $$;

DO $$
DECLARE v_row jsonb;
BEGIN
  SELECT * INTO v_row FROM public.finance_audit_run('SELECT 1 AS ok');
  PERFORM pg_temp.audit_assert(v_row->>'ok' = '1', 'F2-32 SELECT 1 AS ok still aliases ping');
END $$;

DO $$
BEGIN
  PERFORM * FROM public.finance_audit_run('duplicate_source_payment_rows');
  PERFORM pg_temp.audit_assert(true, 'F2-32 named duplicate query executes');
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.finance_audit_run('SELECT * FROM public.users');
    RAISE EXCEPTION 'FAIL: F2-32 arbitrary SELECT accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%allow-list%' THEN
      PERFORM pg_temp.audit_assert(true, 'F2-32 arbitrary SELECT rejected');
    ELSE
      RAISE;
    END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.finance_audit_run('duplicate_source_payment_rows:not-a-date:2026-01-01');
    RAISE EXCEPTION 'FAIL: F2-32 invalid date window accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%allow-list%' THEN
      PERFORM pg_temp.audit_assert(true, 'F2-32 invalid date window rejected');
    ELSE
      RAISE;
    END IF;
  END;
END $$;

ROLLBACK;
