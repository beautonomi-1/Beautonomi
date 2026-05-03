-- Migration 570: Complete the notification_type enum so admin broadcasts,
-- payment requests, custom offers, and other in-app rows stop being
-- normalised to "system" by `insert-notification.ts`.
--
-- §Notifications-audit 2026-05: migration 413 added most enum values but
-- skipped a handful that production code still emits via insertNotifications.
-- The runtime helper falls back to "system" for unknown values, so the
-- bell shows the right title/body but rendering logic that branches on
-- type (icon, deep-link routing, filtering) fails. Adding these values
-- restores type fidelity end-to-end.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'admin_broadcast';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'provider_broadcast';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_confirmed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'booking_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_link_sent';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'additional_charge_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'custom_offer';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'custom_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'on_demand_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'on_demand_declined';
