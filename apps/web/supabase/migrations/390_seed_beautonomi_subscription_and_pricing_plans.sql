-- Seed / upgrade three Beautonomi platform tiers (Starter free, Growth, Scale) with rich features.
-- Free tier includes Yoco + calendar sync (Google, Outlook, iCal) for marketing parity.
-- Idempotent: safe to re-run; uses NOT EXISTS / targeted UPDATEs.

-- ─── 1) Starter (free): one row — prefer slug free-tier-default, else first active free plan ─
UPDATE public.subscription_plans sp
SET
  name = 'Beautonomi Starter',
  description = 'Start with online booking, Yoco, and calendar sync. Upgrade for email marketing and higher limits.',
  price_monthly = 0,
  price_yearly = 0,
  currency = 'ZAR',
  is_active = true,
  is_free = true,
  display_order = 0,
  max_bookings_per_month = 50,
  max_staff_members = 4,
  max_locations = 3,
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
WHERE sp.id = (
  SELECT s.id
  FROM public.subscription_plans s
  WHERE s.is_free = true AND s.is_active = true
  ORDER BY CASE WHEN s.slug = 'free-tier-default' THEN 0 ELSE 1 END, s.display_order NULLS LAST, s.created_at
  LIMIT 1
);

UPDATE public.subscription_plans u
SET slug = 'free-tier-default'
WHERE u.id = (
  SELECT s.id
  FROM public.subscription_plans s
  WHERE s.is_free = true AND s.is_active = true
  ORDER BY CASE WHEN s.slug = 'free-tier-default' THEN 0 ELSE 1 END, s.display_order NULLS LAST, s.created_at
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.subscription_plans o WHERE o.slug = 'free-tier-default' AND o.id <> u.id
);

-- ─── 2) Paid: Growth ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans (
  name, slug, description, price_monthly, price_yearly, currency,
  is_active, is_free, display_order, features,
  max_bookings_per_month, max_staff_members, max_locations
)
SELECT
  'Beautonomi Growth',
  'beautonomi-growth',
  'SMS, email marketing, modest included ads credit, and higher limits than Starter.',
  99.00,
  990.00,
  'ZAR',
  true,
  false,
  1,
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email", "sms"]'::jsonb,
      'max_campaigns_per_month', 30,
      'max_recipients_per_campaign', 2000,
      'advanced_segmentation', true,
      'custom_integrations', false
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 8000,
      'file_attachments', true,
      'group_chats', true
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', 8,
      'advanced_features', true
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', 25
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', 8
    ),
    'booking_limits', jsonb_build_object(
      'enabled', false
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', true,
      'data_export', true,
      'api_access', false,
      'report_types', '["sales", "bookings", "staff", "clients", "products", "payments"]'::jsonb
    ),
    'marketing_automations', jsonb_build_object(
      'enabled', true,
      'max_automations', 40
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', true,
      'advanced_patterns', true
    ),
    'express_booking', jsonb_build_object(
      'enabled', true,
      'max_links', 20
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google", "outlook", "ical"]'::jsonb,
      'api_access', true
    ),
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 50,
      'note', 'Promotional ad budget credit; applied per platform rules.'
    )
  ),
  NULL,
  25,
  8
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans s WHERE s.slug = 'beautonomi-growth');

-- ─── 3) Paid: Scale ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans (
  name, slug, description, price_monthly, price_yearly, currency,
  is_active, is_free, display_order, features,
  max_bookings_per_month, max_staff_members, max_locations
)
SELECT
  'Beautonomi Scale',
  'beautonomi-scale',
  'Multi-location brands: WhatsApp campaigns, unlimited-scale options, and priority tooling.',
  299.00,
  2990.00,
  'ZAR',
  true,
  false,
  2,
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email", "sms", "whatsapp"]'::jsonb,
      'max_campaigns_per_month', NULL,
      'max_recipients_per_campaign', NULL,
      'advanced_segmentation', true,
      'custom_integrations', true
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', NULL,
      'file_attachments', true,
      'group_chats', true
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', NULL,
      'advanced_features', true
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', NULL
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', NULL
    ),
    'booking_limits', jsonb_build_object(
      'enabled', false
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', true,
      'data_export', true,
      'api_access', true,
      'report_types', '["sales", "bookings", "staff", "clients", "products", "payments", "gift_cards", "packages"]'::jsonb
    ),
    'marketing_automations', jsonb_build_object(
      'enabled', true,
      'max_automations', NULL
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', true,
      'advanced_patterns', true
    ),
    'express_booking', jsonb_build_object(
      'enabled', true,
      'max_links', NULL
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google", "outlook", "ical"]'::jsonb,
      'api_access', true
    )
  ),
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans s WHERE s.slug = 'beautonomi-scale');

-- ─── 4) Global pricing_plans (tenant_id NULL) for onboarding / marketing CMS ─────────────────
INSERT INTO public.pricing_plans (
  name, price, period, description, cta_text, is_popular, display_order, is_active, tenant_id, subscription_plan_id
)
SELECT
  'Beautonomi Starter',
  'R0',
  '/month',
  'Up to 50 bookings/mo, 4 staff, 3 locations: Yoco, calendar sync, and chat — no email marketing on Free.',
  'Start free',
  false,
  0,
  true,
  NULL,
  sp.id
FROM public.subscription_plans sp
WHERE sp.slug = 'free-tier-default'
  AND NOT EXISTS (
    SELECT 1 FROM public.pricing_plans pp
    WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Starter'
  );

INSERT INTO public.pricing_plans (
  name, price, period, description, cta_text, is_popular, display_order, is_active, tenant_id, subscription_plan_id
)
SELECT
  'Beautonomi Growth',
  'R99',
  '/month',
  'SMS + email, R50/mo included ads credit, and higher limits. Upgrade from Starter anytime.',
  'Upgrade',
  true,
  1,
  true,
  NULL,
  sp.id
FROM public.subscription_plans sp
WHERE sp.slug = 'beautonomi-growth'
  AND NOT EXISTS (
    SELECT 1 FROM public.pricing_plans pp
    WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Growth'
  );

INSERT INTO public.pricing_plans (
  name, price, period, description, cta_text, is_popular, display_order, is_active, tenant_id, subscription_plan_id
)
SELECT
  'Beautonomi Scale',
  'R299',
  '/month',
  'WhatsApp, unlimited-scale options, and full analytics — for multi-location brands.',
  'Talk to sales',
  false,
  2,
  true,
  NULL,
  sp.id
FROM public.subscription_plans sp
WHERE sp.slug = 'beautonomi-scale'
  AND NOT EXISTS (
    SELECT 1 FROM public.pricing_plans pp
    WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Scale'
  );

-- ─── 5) Marketing feature bullets (only when plan has zero feature lines) ─────────────────────
INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT p.id, v.txt, v.ord
FROM public.pricing_plans p
CROSS JOIN (VALUES
  ('50 online bookings per month', 0),
  ('Yoco POS & card terminals', 1),
  ('Calendar sync: Google, Outlook & iCal', 2),
  ('Up to 4 staff & 3 locations', 3),
  ('Client chat (email campaigns on paid plans)', 4),
  ('Express booking links & recurring appointments', 5)
) AS v(txt, ord)
WHERE p.tenant_id IS NULL AND p.name = 'Beautonomi Starter'
  AND NOT EXISTS (SELECT 1 FROM public.pricing_plan_features f WHERE f.plan_id = p.id);

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT p.id, v.txt, v.ord
FROM public.pricing_plans p
CROSS JOIN (VALUES
  ('Everything in Starter limits, unlocked marketing', 0),
  ('R50/mo included platform ads credit', 1),
  ('SMS + email campaigns & segmentation', 2),
  ('Up to 25 staff & 8 locations', 3),
  ('Advanced analytics & data export', 4),
  ('Higher chat & automation limits', 5)
) AS v(txt, ord)
WHERE p.tenant_id IS NULL AND p.name = 'Beautonomi Growth'
  AND NOT EXISTS (SELECT 1 FROM public.pricing_plan_features f WHERE f.plan_id = p.id);

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT p.id, v.txt, v.ord
FROM public.pricing_plans p
CROSS JOIN (VALUES
  ('Everything in Growth', 0),
  ('WhatsApp + unlimited-scale options', 1),
  ('Unlimited staff & locations (policy-based)', 2),
  ('API access & full report suite', 3),
  ('White-glove onboarding (sales-assisted)', 4)
) AS v(txt, ord)
WHERE p.tenant_id IS NULL AND p.name = 'Beautonomi Scale'
  AND NOT EXISTS (SELECT 1 FROM public.pricing_plan_features f WHERE f.plan_id = p.id);
