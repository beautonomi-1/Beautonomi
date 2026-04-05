-- Fix inconsistent subscription_plans rows (e.g. free-tier-default with is_free NULL/false or inactive)
-- and ensure at least one active free tier exists so public booking + ensureProviderFreeSubscriptionRow work.

UPDATE public.subscription_plans
SET
  is_free = true,
  is_active = true
WHERE slug = 'free-tier-default';

INSERT INTO public.subscription_plans (
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  currency,
  is_active,
  is_free,
  display_order,
  features,
  max_bookings_per_month,
  max_staff_members,
  max_locations
)
SELECT
  'Free',
  'free-tier-default',
  'Default free tier for providers without a paid platform subscription',
  0,
  0,
  'ZAR',
  true,
  true,
  0,
  jsonb_build_object(
    'booking_limits', jsonb_build_object('enabled', false)
  ),
  NULL,
  NULL,
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscription_plans sp
  WHERE COALESCE(sp.is_free, false) = true
    AND sp.is_active = true
);
