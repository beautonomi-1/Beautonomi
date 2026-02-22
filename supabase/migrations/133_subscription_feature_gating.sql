-- Migration: Subscription Feature Gating
-- 133_subscription_feature_gating.sql
-- Adds feature gating for marketing integrations, chat messages, and Yoco integration

-- Update subscription_plans to include feature definitions
-- This migration adds default feature structures to existing plans

-- Function to safely merge features JSONB
CREATE OR REPLACE FUNCTION merge_subscription_features(
  existing_features JSONB,
  new_features JSONB
)
RETURNS JSONB AS $$
BEGIN
  -- If existing_features is null or empty, return new_features
  IF existing_features IS NULL OR existing_features = '{}'::jsonb OR existing_features = '[]'::jsonb THEN
    RETURN new_features;
  END IF;
  
  -- Merge the features, with new_features taking precedence
  RETURN existing_features || new_features;
END;
$$ LANGUAGE plpgsql;

-- Update free tier (if exists) - minimal features
UPDATE subscription_plans
SET features = merge_subscription_features(
  COALESCE(features, '{}'::jsonb),
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', false,
      'channels', '[]'::jsonb,
      'custom_integrations', false
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 50,
      'file_attachments', false,
      'group_chats', false
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', false,
      'max_devices', 0,
      'advanced_features', false
    ),
    'staff_management', jsonb_build_object(
      'enabled', false,
      'max_staff_members', 0
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', 1
    ),
    'booking_limits', jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', 10
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', false,
      'basic_reports', false,
      'advanced_reports', false,
      'data_export', false,
      'api_access', false,
      'report_types', '[]'::jsonb
    ),
    'marketing_automations', jsonb_build_object(
      'enabled', false,
      'max_automations', 0
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', false,
      'advanced_patterns', false
    ),
    'express_booking', jsonb_build_object(
      'enabled', false,
      'max_links', 0
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', false,
      'providers', '[]'::jsonb,
      'api_access', false
    )
  )
)
WHERE is_free = true;

-- Update starter/basic tier - basic features
UPDATE subscription_plans
SET features = merge_subscription_features(
  COALESCE(features, '{}'::jsonb),
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email"]'::jsonb,
      'max_campaigns_per_month', 5,
      'max_recipients_per_campaign', 100,
      'advanced_segmentation', false,
      'custom_integrations', false
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 200,
      'file_attachments', true,
      'group_chats', false
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', 1,
      'advanced_features', false
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', 2
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', 1
    ),
    'booking_limits', jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', 50
    ),
    'advanced_analytics', jsonb_build_object(
      'enabled', true,
      'basic_reports', true,
      'advanced_reports', false,
      'data_export', false,
      'api_access', false,
      'report_types', '["sales", "bookings"]'::jsonb
    ),
    'marketing_automations', jsonb_build_object(
      'enabled', true,
      'max_automations', 3
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', true,
      'advanced_patterns', false
    ),
    'express_booking', jsonb_build_object(
      'enabled', true,
      'max_links', 1
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google"]'::jsonb,
      'api_access', false
    )
  )
)
WHERE name ILIKE '%starter%' OR name ILIKE '%basic%';

-- Update professional tier - enhanced features
UPDATE subscription_plans
SET features = merge_subscription_features(
  COALESCE(features, '{}'::jsonb),
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email", "sms"]'::jsonb,
      'max_campaigns_per_month', 20,
      'max_recipients_per_campaign', 500,
      'advanced_segmentation', true,
      'custom_integrations', true
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', 1000,
      'file_attachments', true,
      'group_chats', true
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', 5,
      'advanced_features', true
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', 10
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', 3
    ),
    'booking_limits', jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', 200
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
      'api_access', false
    )
  )
)
WHERE name ILIKE '%professional%' OR name ILIKE '%pro%';

-- Update enterprise/premium tier - unlimited features
UPDATE subscription_plans
SET features = merge_subscription_features(
  COALESCE(features, '{}'::jsonb),
  jsonb_build_object(
    'marketing_campaigns', jsonb_build_object(
      'enabled', true,
      'channels', '["email", "sms", "whatsapp"]'::jsonb,
      'max_campaigns_per_month', NULL, -- Unlimited
      'max_recipients_per_campaign', NULL, -- Unlimited
      'advanced_segmentation', true,
      'custom_integrations', true
    ),
    'chat_messages', jsonb_build_object(
      'enabled', true,
      'max_messages_per_month', NULL, -- Unlimited
      'file_attachments', true,
      'group_chats', true
    ),
    'yoco_integration', jsonb_build_object(
      'enabled', true,
      'max_devices', NULL, -- Unlimited
      'advanced_features', true
    ),
    'staff_management', jsonb_build_object(
      'enabled', true,
      'max_staff_members', NULL -- Unlimited
    ),
    'multi_location', jsonb_build_object(
      'enabled', true,
      'max_locations', NULL -- Unlimited
    ),
    'booking_limits', jsonb_build_object(
      'enabled', true,
      'max_bookings_per_month', NULL -- Unlimited
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
      'max_automations', NULL -- Unlimited
    ),
    'recurring_appointments', jsonb_build_object(
      'enabled', true,
      'advanced_patterns', true
    ),
    'express_booking', jsonb_build_object(
      'enabled', true,
      'max_links', NULL -- Unlimited
    ),
    'calendar_sync', jsonb_build_object(
      'enabled', true,
      'providers', '["google", "outlook", "ical"]'::jsonb,
      'api_access', true
    )
  )
)
WHERE name ILIKE '%enterprise%' OR name ILIKE '%premium%' OR name ILIKE '%unlimited%';

-- Add comments for documentation
COMMENT ON COLUMN subscription_plans.features IS 'JSONB object containing feature flags and limits. Includes: marketing_campaigns, chat_messages, yoco_integration, staff_management, multi_location, booking_limits, advanced_analytics, marketing_automations, recurring_appointments, express_booking, calendar_sync';
