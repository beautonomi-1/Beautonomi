-- Align Beautonomi Growth numeric caps with 883 marketing copy and the 390 seed.
-- 883 rewrote Growth ads/reports copy but left staff/location (and related) numbers
-- on whatever the existing subscription_plans row already had.
-- Idempotent; safe to re-run.

UPDATE public.subscription_plans sp
SET
  max_bookings_per_month = NULL,
  max_staff_members = 25,
  max_locations = 8,
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'staff_management', COALESCE(sp.features->'staff_management', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_staff_members', 25
    ),
    'multi_location', COALESCE(sp.features->'multi_location', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_locations', 8
    ),
    'booking_limits', COALESCE(sp.features->'booking_limits', '{}'::jsonb) || jsonb_build_object(
      'enabled', false
    ),
    'chat_messages', COALESCE(sp.features->'chat_messages', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 8000
    ),
    'marketing_automations', COALESCE(sp.features->'marketing_automations', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_automations', 40
    ),
    'express_booking', COALESCE(sp.features->'express_booking', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_links', 20
    ),
    'yoco_integration', COALESCE(sp.features->'yoco_integration', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_devices', 8
    )
  )
WHERE sp.slug = 'beautonomi-growth';
