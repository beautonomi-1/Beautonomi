-- Migration 410: Enable RLS on postal_areas_import_stage
-- This is a server-side ETL staging table; it should only be accessible via
-- the service_role (used by the rebuild_postal_areas_from_stage function and
-- admin import jobs). Enabling RLS with a service_role-only policy closes the
-- gap identified in the multi-tenant security audit.

ALTER TABLE IF EXISTS public.postal_areas_import_stage ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by server-side import jobs and the
-- rebuild_postal_areas_from_stage SECURITY DEFINER function) can read or write.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'postal_areas_import_stage'
      AND policyname = 'Service role full access postal_areas_import_stage'
  ) THEN
    CREATE POLICY "Service role full access postal_areas_import_stage"
      ON public.postal_areas_import_stage FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
