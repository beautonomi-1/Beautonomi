-- Adjust paid plan prices (Growth R99, Scale R299), free-tier limits (50 bookings/mo, 4 staff, 3 locations, no email marketing),
-- and add modest platform ads credit on Growth (features.platform_ads).

-- ─── Free tier (Beautonomi Starter / free-tier-default) ─────────────────────────────────────
UPDATE public.subscription_plans sp
SET
  max_bookings_per_month = 50,
  max_staff_members = 4,
  max_locations = 3,
  description = 'Start with online booking, Yoco, and calendar sync. Upgrade for email marketing and higher limits.',
  features = jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', false,
      'channels', '[]'::jsonb,
      'max_campaigns_per_month', 0,
      'max_recipients_per_campaign', 0,
      'advanced_segmentation', false,
      'custom_integrations', false
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 2000,
      'file_attachments', true,
      'group_chats', false
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', 3,
      'advanced_features', true
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', 4
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', 3
    ),
    'booking_limits', jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', 50
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', false,
      'data_export', true,
      'api_access', false,
      'report_types', '["sales", "bookings", "clients"]'::jsonb
    ),
    'marketing_automations', jsonb_build_object(
      'enabled', true,
      'max_automations', 10
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', true,
      'advanced_patterns', true
    ),
    'express_booking', jsonb_build_object(
      'enabled', true,
      'max_links', 5
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google", "outlook", "ical"]'::jsonb,
      'api_access', true
    )
  )
WHERE sp.slug = 'free-tier-default';

-- ─── Growth: R99 / R990 yr + included ads credit (features.platform_ads) ─────────────────────
UPDATE public.subscription_plans sp
SET
  price_monthly = 99.00,
  price_yearly = 990.00,
  description = 'SMS, email marketing, modest included ads credit, and higher limits than Starter.',
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 50,
      'note', 'Promotional ad budget credit; applied per platform rules.'
    )
  )
WHERE sp.slug = 'beautonomi-growth';

-- Scale: R299 / R2990 yr ─────────────────────────────────────────────────────────────────────
UPDATE public.subscription_plans sp
SET
  price_monthly = 299.00,
  price_yearly = 2990.00
WHERE sp.slug = 'beautonomi-scale';

-- ─── Global pricing_plans CMS (display prices) ───────────────────────────────────────────────
UPDATE public.pricing_plans pp
SET
  price = 'R99',
  description = 'SMS + email, R50/mo included ads credit, and higher limits. Upgrade from Starter anytime.'
FROM public.subscription_plans sp
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Growth'
  AND sp.slug = 'beautonomi-growth'
  AND pp.subscription_plan_id = sp.id;

UPDATE public.pricing_plans pp
SET
  price = 'R299',
  description = 'WhatsApp, unlimited-scale options, and full analytics — for multi-location brands.'
FROM public.subscription_plans sp
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Scale'
  AND sp.slug = 'beautonomi-scale'
  AND pp.subscription_plan_id = sp.id;

UPDATE public.pricing_plans pp
SET
  description = 'Up to 50 bookings/mo, 4 staff, 3 locations: Yoco, calendar sync, and chat — no email marketing on Free.'
FROM public.subscription_plans sp
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Starter'
  AND sp.slug = 'free-tier-default'
  AND pp.subscription_plan_id = sp.id;

-- Refresh Starter marketing bullets (replace lines for this plan)
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

DELETE FROM public.pricing_plan_features pf
USING public.pricing_plans pp
WHERE pf.plan_id = pp.id
  AND pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Growth';

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT pp.id, v.txt, v.ord
FROM public.pricing_plans pp
CROSS JOIN (VALUES
  ('Everything in Starter limits, unlocked marketing', 0),
  ('R50/mo included platform ads credit', 1),
  ('SMS + email campaigns & segmentation', 2),
  ('Up to 25 staff & 8 locations', 3),
  ('Advanced analytics & data export', 4),
  ('Higher chat & automation limits', 5)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Growth';
