-- Ensure at least one active free subscription_plans row exists so
-- get_provider_subscription_plan() can resolve a tier when provider_subscriptions is empty.

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
  WHERE sp.is_free = true
    AND sp.is_active = true
);
