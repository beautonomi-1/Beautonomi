-- provider_onboarding is a legacy public.users.role used by portal routing.
-- Commit this value before 1023 casts it; Postgres cannot use a new enum
-- label in the same transaction that adds it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'provider_onboarding'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'provider_onboarding';
  END IF;
END $$;
