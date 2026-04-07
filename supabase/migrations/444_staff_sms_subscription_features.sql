-- Gate staff (team) SMS notification preferences by plan via features.staff_sms_notifications.
-- Paid Growth/Scale include staff SMS; free and other tiers default to off unless overridden in admin.

UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'staff_sms_notifications',
  CASE
    WHEN slug IN ('beautonomi-growth', 'beautonomi-scale') THEN jsonb_build_object('enabled', true)
    ELSE jsonb_build_object('enabled', false)
  END
)
WHERE is_active = true;
