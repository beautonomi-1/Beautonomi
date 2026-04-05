-- Free (Starter) tier: 50 bookings/mo, 4 staff, 3 locations (subscription_plans + CMS copy + bullets).

UPDATE public.subscription_plans sp
SET
  max_bookings_per_month = 50,
  max_staff_members = 4,
  max_locations = 3,
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'booking_limits', COALESCE(sp.features->'booking_limits', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', 50
    ),
    'staff_management', COALESCE(sp.features->'staff_management', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_staff_members', 4
    ),
    'multi_location', COALESCE(sp.features->'multi_location', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'max_locations', 3
    )
  )
WHERE sp.slug = 'free-tier-default';

UPDATE public.pricing_plans pp
SET
  description = 'Up to 50 bookings/mo, 4 staff, 3 locations: Yoco, calendar sync, and chat — no email marketing on Free.'
FROM public.subscription_plans sp
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Starter'
  AND sp.slug = 'free-tier-default'
  AND pp.subscription_plan_id = sp.id;

DELETE FROM public.pricing_plan_features pf
USING public.pricing_plans pp
WHERE pf.plan_id = pp.id
  AND pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Starter';

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT pp.id, v.txt, v.ord
FROM public.pricing_plans pp
CROSS JOIN (VALUES
  ('50 online bookings per month', 0),
  ('Yoco POS & card terminals', 1),
  ('Calendar sync: Google, Outlook & iCal', 2),
  ('Up to 4 staff & 3 locations', 3),
  ('Client chat (email campaigns on paid plans)', 4),
  ('Express booking links & recurring appointments', 5)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Starter';
