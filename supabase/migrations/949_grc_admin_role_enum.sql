-- GRC admin shell role on user_role enum ONLY.
-- Apply before 950_grc_rbac.sql (Postgres enum value must exist in a prior transaction).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_grc'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'admin_grc';
  END IF;
END $$;
