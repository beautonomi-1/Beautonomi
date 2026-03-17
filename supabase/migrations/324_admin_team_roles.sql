-- Add admin team roles to user_role enum for section-based admin access.
-- Each role maps to one admin section (see apps/web lib/admin-sections.ts).

DO $$
DECLARE
  r text;
  roles text[] := ARRAY[
    'admin_support', 'admin_finance', 'admin_trust', 'admin_content',
    'admin_ecommerce', 'admin_marketing', 'admin_integrations',
    'admin_operations', 'admin_platform_config'
  ];
BEGIN
  FOREACH r IN ARRAY roles
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = r
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      EXECUTE format('ALTER TYPE user_role ADD VALUE %L', r);
    END IF;
  END LOOP;
END $$;
