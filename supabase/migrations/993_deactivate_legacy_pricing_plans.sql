-- Deactivate legacy marketing pricing_plans from migration 066 (no subscription_plan_id).
-- Beautonomi tiers (390/883) remain the onboarding / checkout catalog.

UPDATE public.pricing_plans
SET is_active = false,
    updated_at = NOW()
WHERE subscription_plan_id IS NULL
  AND name IN ('Starter', 'Professional', 'Enterprise');
