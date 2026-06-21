-- Align public pricing-page CTA copy with the platform's self-serve reality.
--
-- §Pricing-audit 2026-06: the marketing pricing page (/pricing) renders
-- pricing_plans.cta_text verbatim. The seeded copy was misaligned for public
-- acquisition:
--   * Growth used "Upgrade" — in-app language; a first-time visitor has no
--     plan to upgrade FROM, and it contradicts the "14-day free trial" promise.
--   * Scale used "Talk to sales" — but the button starts the same self-serve
--     signup/onboarding flow and the platform has no sales/contact route.
-- Correct both to self-serve CTAs. Free already uses "Get started".
--
-- Matches on either the canonical name or the linked subscription plan slug so
-- global (tenant_id IS NULL) rows and tenant clones are all covered, and is
-- idempotent (safe to re-run).

UPDATE public.pricing_plans pp
SET cta_text = 'Get started'
WHERE pp.cta_text IS DISTINCT FROM 'Get started'
  AND (
    pp.name = 'Beautonomi Growth'
    OR pp.subscription_plan_id IN (
      SELECT id FROM public.subscription_plans WHERE slug = 'beautonomi-growth'
    )
  );

UPDATE public.pricing_plans pp
SET cta_text = 'Start free trial'
WHERE pp.cta_text IS DISTINCT FROM 'Start free trial'
  AND (
    pp.name = 'Beautonomi Scale'
    OR pp.subscription_plan_id IN (
      SELECT id FROM public.subscription_plans WHERE slug = 'beautonomi-scale'
    )
  );
