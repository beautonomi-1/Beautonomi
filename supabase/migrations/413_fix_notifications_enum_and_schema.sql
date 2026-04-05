-- Migration 413: Fix notifications table schema
-- Problem: notification_type enum is missing many values used in application code,
-- and the table is missing `metadata` and `link` columns that code inserts into.
-- This causes ALL inserts to fail silently, leaving the notifications table empty.

-- Step 1: Extend the notification_type enum with all missing values
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_appointment';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_message';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_status_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_rescheduled';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_staff_changed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'rebook_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'refund_processed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_link_sent';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'additional_charge_paid';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_review';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'review_response';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'low_stock_alert';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'waitlist_available';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'waitlist_match';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'marketing_email';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'custom_offer';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'custom_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'on_demand_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'on_demand_declined';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payout_processed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payout_failed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'subscription_limit';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'product_order_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'return_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'staff_assignment';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_broadcast';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'high_priority';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'account_verification';

-- Step 2: Add metadata column (used by many notification inserts alongside / instead of data)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL DEFAULT '{}'::jsonb;

-- Step 3: Add link column (used as a cleaner alias for action_url in many places)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text NULL;

-- Step 4: Sync existing action_url rows into link so queries on either column work
UPDATE public.notifications
  SET link = action_url
  WHERE link IS NULL AND action_url IS NOT NULL;
