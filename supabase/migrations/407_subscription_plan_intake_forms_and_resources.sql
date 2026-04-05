-- Feature flags for intake/consent forms and service resources (see apps/web/src/lib/subscriptions/feature-access.ts).
-- Merge into active free-tier plans so existing behaviour stays allowed; paid plans can set enabled false in subscription_plans.features.

UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'intake_forms', jsonb_build_object('enabled', true),
  'service_resources', jsonb_build_object('enabled', true)
)
WHERE is_active = true
  AND COALESCE(is_free, false) = true;
