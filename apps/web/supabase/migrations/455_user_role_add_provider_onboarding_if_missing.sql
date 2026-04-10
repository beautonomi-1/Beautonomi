-- Ensure user_role enum includes provider_onboarding (TypeScript allows it; some code paths may write it).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'provider_onboarding'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'provider_onboarding';
  END IF;
END $$;
