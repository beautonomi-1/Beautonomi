-- ============================================================================
-- Migration 189: Add Paystack Plan Codes to Pricing Plans
-- ============================================================================
-- This migration adds Paystack subscription plan code fields to pricing_plans
-- to enable direct integration with Paystack subscriptions.
-- ============================================================================

-- Add Paystack plan code fields to pricing_plans
ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS paystack_plan_code_monthly TEXT,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_yearly TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;

-- Add indexes for Paystack plan code lookups
CREATE INDEX IF NOT EXISTS idx_pricing_plans_paystack_monthly 
  ON public.pricing_plans(paystack_plan_code_monthly) 
  WHERE paystack_plan_code_monthly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_plans_paystack_yearly 
  ON public.pricing_plans(paystack_plan_code_yearly) 
  WHERE paystack_plan_code_yearly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_plans_subscription_plan 
  ON public.pricing_plans(subscription_plan_id) 
  WHERE subscription_plan_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.pricing_plans.paystack_plan_code_monthly IS 'Paystack plan code for monthly billing period';
COMMENT ON COLUMN public.pricing_plans.paystack_plan_code_yearly IS 'Paystack plan code for yearly billing period';
COMMENT ON COLUMN public.pricing_plans.subscription_plan_id IS 'Link to subscription_plans table for feature gating and limits';
