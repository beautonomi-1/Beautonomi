-- Beautonomi Database Migration
-- 607_offerings_onboarding_auto_generated_flag.sql
-- Persists whether an offering was auto-generated during provider onboarding.

ALTER TABLE public.offerings
ADD COLUMN IF NOT EXISTS is_onboarding_auto_generated BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_offerings_onboarding_auto_generated
  ON public.offerings(provider_id, is_onboarding_auto_generated);

COMMENT ON COLUMN public.offerings.is_onboarding_auto_generated IS
  'True when the service was auto-generated as a starter offering during provider onboarding.';
