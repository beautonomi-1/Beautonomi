-- provider_onboarding_welcome is sent after the onboarding wizard is submitted
-- (POST /api/provider/onboarding). Its link must open the setup checklist, not the
-- wizard the provider has already completed.
UPDATE public.notification_templates
SET url = '/provider/get-started',
    description = 'Sent to new providers after the onboarding wizard is submitted (pending approval)'
WHERE key = 'provider_onboarding_welcome'
  AND url IS DISTINCT FROM '/provider/get-started';
