-- Retention UX: Starter can take unlimited online bookings; pay-as-you-go ads (no included credit).
-- Idempotent.

UPDATE public.subscription_plans sp
SET
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'booking_limits', COALESCE(sp.features->'booking_limits', '{}'::jsonb) || jsonb_build_object(
      'enabled', false,
      'max_bookings_per_month', 50
    ),
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 0,
      'note', 'Pay-as-you-go promoted placement; no monthly credit on Starter.'
    )
  )
WHERE sp.slug = 'free-tier-default';

DELETE FROM public.pricing_plan_features pf
USING public.pricing_plans pp
WHERE pf.plan_id = pp.id
  AND pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Starter';

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT pp.id, v.txt, v.ord
FROM public.pricing_plans pp
CROSS JOIN (VALUES
  ('Up to 4 team members and 3 locations', 0),
  ('Yoco in-person card payments', 1),
  ('Calendar sync: Google, Outlook and iCal', 2),
  ('Client chat (2,000 messages per month)', 3),
  ('Express booking links (up to 5) and recurring appointments', 4),
  ('Basic reports: sales, bookings and clients', 5),
  ('Promoted placement ads (where available; pay-as-you-go)', 6),
  ('Push and in-app automations (SMS/email campaigns on paid plans)', 7)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Starter';
