-- F10: Normalise financial_period_locks.tenant_id to UUID to match the rest of the
-- tenant-scoped schema. Prior migration 468 declared tenant_id TEXT, which forces
-- every read/write path to cast and breaks FK possibilities against tenants(id).

DO $$
DECLARE
  v_bad_rows BIGINT;
BEGIN
  -- Abort if there are non-UUID values; operator must clean up manually.
  SELECT COUNT(*) INTO v_bad_rows
  FROM public.financial_period_locks
  WHERE tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_bad_rows > 0 THEN
    RAISE EXCEPTION 'financial_period_locks contains % non-UUID tenant_id rows; resolve before running 488.', v_bad_rows;
  END IF;
END $$;

ALTER TABLE public.financial_period_locks
  ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid;

-- If tenants.id exists, add a FK so orphans can no longer be inserted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'financial_period_locks'
      AND constraint_name = 'financial_period_locks_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.financial_period_locks
      ADD CONSTRAINT financial_period_locks_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
