-- Subscription plan truth alignment: restore restrictive Starter (undo 667 drift),
-- fix Growth/Scale entitlements, sync marketing copy and Apple IAP descriptions.
-- Idempotent; safe to re-run.

-- ─── 1) Starter (free-tier-default) ───────────────────────────────────────────
UPDATE public.subscription_plans sp
SET
  max_bookings_per_month = 50,
  max_staff_members = 4,
  max_locations = 3,
  description = 'Online booking, Yoco, calendar sync and client chat. Upgrade for SMS/email marketing and higher limits.',
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'booking_limits', jsonb_build_object('enabled', true, 'max_bookings_per_month', 50),
    'staff_management', jsonb_build_object('enabled', true, 'max_staff_members', 4),
    'multi_location', jsonb_build_object('enabled', true, 'max_locations', 3),
    'marketing_campaigns', jsonb_build_object(
      'enabled', false,
      'channels', '[]'::jsonb,
      'max_campaigns_per_month', 0,
      'max_recipients_per_campaign', 0,
      'advanced_segmentation', false,
      'custom_integrations', false,
      'use_platform_credentials', false,
      'included_marketing_credit_zar_per_month', 0
    ),
    'marketing_automations', jsonb_build_object('enabled', true, 'max_automations', 10),
    'staff_sms_notifications', jsonb_build_object('enabled', false),
    'platform_ads', jsonb_build_object('enabled', false, 'included_credit_zar_per_month', 0, 'note', ''),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', false,
      'data_export', false,
      'api_access', false,
      'report_types', '["sales", "bookings", "clients"]'::jsonb
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 2000,
      'file_attachments', true,
      'group_chats', false
    ),
    'yoco_integration', jsonb_build_object('enabled', true, 'max_devices', 3, 'advanced_features', true),
    'express_booking', jsonb_build_object('enabled', true, 'max_links', 5),
    'recurring_appointments', jsonb_build_object('enabled', true, 'advanced_patterns', true),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google", "outlook", "ical"]'::jsonb,
      'api_access', true
    )
  )
WHERE sp.slug = 'free-tier-default';

-- ─── 2) Growth ────────────────────────────────────────────────────────────────
UPDATE public.subscription_plans sp
SET
  description = 'SMS and email marketing, R50/month included marketing credit, and higher team limits.',
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 50,
      'note', 'Promotional ad budget credit; applied per platform rules.'
    ),
    'marketing_campaigns', COALESCE(sp.features->'marketing_campaigns', '{}'::jsonb) || jsonb_build_object(
      'use_platform_credentials', true
    ),
    'advanced_analytics', COALESCE(sp.features->'advanced_analytics', '{}'::jsonb) || jsonb_build_object(
      'report_types', '["sales", "bookings", "staff", "clients", "products", "payments", "memberships"]'::jsonb
    )
  )
WHERE sp.slug = 'beautonomi-growth';

-- ─── 3) Scale ─────────────────────────────────────────────────────────────────
UPDATE public.subscription_plans sp
SET
  description = 'For multi-location brands: WhatsApp, unlimited scale and custom integrations.',
  features = COALESCE(sp.features, '{}'::jsonb) || jsonb_build_object(
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 0,
      'note', 'No included credit; pay-as-you-go top-ups.'
    ),
    'marketing_campaigns', COALESCE(sp.features->'marketing_campaigns', '{}'::jsonb) || jsonb_build_object(
      'included_marketing_credit_zar_per_month', 0
    ),
    'advanced_analytics', COALESCE(sp.features->'advanced_analytics', '{}'::jsonb) || jsonb_build_object(
      'report_types', '["sales", "bookings", "staff", "clients", "products", "payments", "gift_cards", "packages", "memberships"]'::jsonb
    )
  )
WHERE sp.slug = 'beautonomi-scale';

-- ─── 4) Pricing CMS copy (global, tenant_id IS NULL) ────────────────────────

-- Starter
UPDATE public.pricing_plans pp
SET description = 'Online booking, Yoco, calendar sync and client chat. Upgrade for SMS/email marketing and higher limits.'
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Starter';

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
  ('Up to 4 team members and 3 locations', 1),
  ('Yoco in-person card payments', 2),
  ('Calendar sync: Google, Outlook and iCal', 3),
  ('Client chat (2,000 messages per month)', 4),
  ('Express booking links (up to 5) and recurring appointments', 5),
  ('Basic reports: sales, bookings and clients', 6),
  ('Push and in-app automations (SMS/email campaigns on paid plans)', 7)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Starter';

-- Growth
UPDATE public.pricing_plans pp
SET description = 'SMS and email marketing, R50/month included marketing credit, and higher team limits.'
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Growth';

DELETE FROM public.pricing_plan_features pf
USING public.pricing_plans pp
WHERE pf.plan_id = pp.id
  AND pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Growth';

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT pp.id, v.txt, v.ord
FROM public.pricing_plans pp
CROSS JOIN (VALUES
  ('Unlimited online bookings', 0),
  ('SMS and email campaigns with client segmentation', 1),
  ('R50/month included marketing credit for platform sends and promoted ads', 2),
  ('Up to 25 team members and 8 locations', 3),
  ('Advanced reports: staff, products, payments and memberships', 4),
  ('Promoted placement ads (where available)', 5),
  ('8,000 chat messages and up to 40 automations per month', 6)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Growth';

-- Scale
UPDATE public.pricing_plans pp
SET description = 'For multi-location brands: WhatsApp, unlimited scale and custom integrations.'
WHERE pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Scale';

DELETE FROM public.pricing_plan_features pf
USING public.pricing_plans pp
WHERE pf.plan_id = pp.id
  AND pp.tenant_id IS NULL
  AND pp.name = 'Beautonomi Scale';

INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT pp.id, v.txt, v.ord
FROM public.pricing_plans pp
CROSS JOIN (VALUES
  ('SMS, email and WhatsApp campaigns (WhatsApp via your connected Twilio number)', 0),
  ('Unlimited bookings, team members and locations', 1),
  ('Bring your own SendGrid and Twilio integrations', 2),
  ('Full report suite including gift cards, packages and memberships', 3),
  ('Unlimited chat, automations and express booking links', 4),
  ('Promoted placement ads (where available; pay-as-you-go)', 5),
  ('White-glove onboarding (sales-assisted)', 6)
) AS v(txt, ord)
WHERE pp.tenant_id IS NULL AND pp.name = 'Beautonomi Scale';

-- ─── 5) Apple IAP product descriptions ────────────────────────────────────────
UPDATE public.apple_iap_products
SET description = 'SMS and email marketing, R50/mo included credit, and higher team limits.'
WHERE product_id IN (
  'com.beautonomi.partner.sub.growth.monthly',
  'com.beautonomi.partner.sub.growth.yearly'
);

UPDATE public.apple_iap_products
SET description = 'WhatsApp, unlimited scale, custom integrations and full reports. Pay-as-you-go ads.'
WHERE product_id IN (
  'com.beautonomi.partner.sub.scale.monthly',
  'com.beautonomi.partner.sub.scale.yearly'
);
