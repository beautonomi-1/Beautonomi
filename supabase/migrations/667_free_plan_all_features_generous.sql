-- Free tier: every subscription feature ON with generous limits; backfill new gate keys on active plans.
-- Mirrors @beautonomi/subscription-features getFreePlanFeatures() / getFreePlanScalarLimits().

-- ─── 1) Generous free plan (slug free-tier-default, else first active free plan) ───
UPDATE public.subscription_plans sp
SET
  max_bookings_per_month = NULL,
  max_staff_members = 25,
  max_locations = 10,
  features = jsonb_build_object(
    'online_booking', jsonb_build_object('enabled', true),
    'booking_limits', jsonb_build_object('enabled', false, 'max_bookings_per_month', NULL),
    'staff_management', jsonb_build_object('enabled', true, 'max_staff_members', 25),
    'multi_location', jsonb_build_object('enabled', true, 'max_locations', 10),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 10000,
      'file_attachments', true,
      'group_chats', true
    ),
    'intake_forms', jsonb_build_object('enabled', true),
    'service_resources', jsonb_build_object('enabled', true),
    'recurring_appointments', jsonb_build_object('enabled', true, 'advanced_patterns', true),
    'express_booking', jsonb_build_object('enabled', true, 'max_links', 50),
    'custom_requests', jsonb_build_object('enabled', true),
    'packages', jsonb_build_object('enabled', true, 'max_packages', 100),
    'gift_cards', jsonb_build_object('enabled', true, 'max_active_cards', NULL),
    'pos_walk_in', jsonb_build_object('enabled', true),
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email", "sms", "whatsapp"]'::jsonb,
      'max_campaigns_per_month', 100,
      'max_recipients_per_campaign', 5000,
      'advanced_segmentation', true,
      'custom_integrations', true
    ),
    'marketing_automations', jsonb_build_object('enabled', true, 'max_automations', 50),
    'staff_sms_notifications', jsonb_build_object('enabled', true),
    'platform_ads', jsonb_build_object(
      'enabled', true,
      'included_credit_zar_per_month', 100,
      'note', ''
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', true,
      'data_export', true,
      'api_access', true,
      'report_types', '["sales", "bookings", "staff", "clients", "products", "payments", "gift_cards", "packages"]'::jsonb
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', 10,
      'advanced_features', true
    ),
    'paystack_virtual_terminal', jsonb_build_object(
      'enabled', true,
      'max_terminals', NULL,
      'per_location_terminals', true,
      'advanced_reconciliation', true,
      'split_settlement', true
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

-- ─── 2) Backfill new gate keys on all active plans (fail-open safety for legacy rows) ───
UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'online_booking', COALESCE(features->'online_booking', jsonb_build_object('enabled', true)),
  'gift_cards', COALESCE(
    features->'gift_cards',
    jsonb_build_object('enabled', true, 'max_active_cards', NULL)
  ),
  'packages', COALESCE(
    features->'packages',
    jsonb_build_object('enabled', true, 'max_packages', 100)
  ),
  'pos_walk_in', COALESCE(features->'pos_walk_in', jsonb_build_object('enabled', true)),
  'custom_requests', COALESCE(features->'custom_requests', jsonb_build_object('enabled', true)),
  'platform_ads', COALESCE(
    features->'platform_ads',
    jsonb_build_object('enabled', true, 'included_credit_zar_per_month', 100, 'note', '')
  )
)
WHERE is_active = true;
