-- Remove paid-plan "14-day free trial" messaging from seeded DB content.
--
-- Context: Beautonomi already has a free plan, so paid plans must not
-- advertise or imply a trial period. This migration corrects the three
-- places where trial copy was seeded:
--
--   1. pricing_plans.cta_text — "Start free trial" → "Get started"
--      (Scale plan set by migration 697; legacy Professional from 066)
--
--   2. page_content hero_description (pricing page) — trial line → free-plan tagline
--      (seeded by migration 066 L279; read by getPricingPageContent())
--
--   3. pricing_faqs — "What happens after my free trial?" → free-plan FAQ
--      (seeded by migration 066 L267; read by getPricingFAQs() on /pricing)
--
-- All statements are idempotent: they match on the exact original seeded
-- string so admin CMS edits are preserved. They cover global rows
-- (tenant_id IS NULL) and any tenant clones because they match by value,
-- not by tenant — same approach as migration 697.

-- 1. Pricing plan CTAs
UPDATE public.pricing_plans
SET    cta_text   = 'Get started',
       updated_at = now()
WHERE  cta_text = 'Start free trial';

-- 2. Pricing page hero description
UPDATE public.page_content
SET    content    = 'Choose the plan that''s right for your business. Start free, upgrade anytime.',
       updated_at = now()
WHERE  page_slug    = 'pricing'
  AND  section_key  = 'hero_description'
  AND  content = 'Choose the plan that''s right for your business. All plans include a 14-day free trial.';

-- 3. Replace the free-trial FAQ with a free-plan FAQ
UPDATE public.pricing_faqs
SET    question    = 'Do I have to pay to start?',
       answer      = 'No. You can start on the free plan and upgrade to a paid plan whenever you''re ready. No trial or credit card required.',
       updated_at  = now()
WHERE  question = 'What happens after my free trial?';
