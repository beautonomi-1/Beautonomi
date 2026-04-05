-- Beautonomi Database Migration
-- 331_add_admin_section_roles_to_user_role_enum.sql
-- Adds section-based admin roles to user_role enum.

DO $$
DECLARE
  role_value text;
BEGIN
  FOREACH role_value IN ARRAY ARRAY[
    'admin_support',
    'admin_finance',
    'admin_trust',
    'admin_content',
    'admin_ecommerce',
    'admin_marketing',
    'admin_integrations',
    'admin_operations',
    'admin_platform_config'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumlabel = role_value
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      EXECUTE format('ALTER TYPE user_role ADD VALUE %L', role_value);
    END IF;
  END LOOP;
END $$;
