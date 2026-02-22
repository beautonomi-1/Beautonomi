-- Create pricing_plans table for managing pricing plans
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price TEXT NOT NULL,
  period TEXT,
  description TEXT,
  cta_text TEXT NOT NULL DEFAULT 'Get started',
  is_popular BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create pricing_plan_features table for plan features
CREATE TABLE IF NOT EXISTS public.pricing_plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  feature_text TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create pricing_faqs table for pricing page FAQs
CREATE TABLE IF NOT EXISTS public.pricing_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_plans_active ON public.pricing_plans(is_active, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_plan ON public.pricing_plan_features(plan_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_order ON public.pricing_plan_features(plan_id, display_order);
CREATE INDEX IF NOT EXISTS idx_pricing_faqs_active ON public.pricing_faqs(is_active, display_order) WHERE is_active = true;

-- Create trigger functions
CREATE OR REPLACE FUNCTION public.update_pricing_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pricing_plan_features_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pricing_faqs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS update_pricing_plans_updated_at ON public.pricing_plans;
CREATE TRIGGER update_pricing_plans_updated_at
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pricing_plans_updated_at();

DROP TRIGGER IF EXISTS update_pricing_plan_features_updated_at ON public.pricing_plan_features;
CREATE TRIGGER update_pricing_plan_features_updated_at
  BEFORE UPDATE ON public.pricing_plan_features
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pricing_plan_features_updated_at();

DROP TRIGGER IF EXISTS update_pricing_faqs_updated_at ON public.pricing_faqs;
CREATE TRIGGER update_pricing_faqs_updated_at
  BEFORE UPDATE ON public.pricing_faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pricing_faqs_updated_at();

-- Enable RLS
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pricing_plans
CREATE POLICY "Public can view active pricing plans"
  ON public.pricing_plans
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Superadmins can manage pricing plans"
  ON public.pricing_plans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- RLS Policies for pricing_plan_features
CREATE POLICY "Public can view pricing plan features"
  ON public.pricing_plan_features
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.pricing_plans
      WHERE pricing_plans.id = pricing_plan_features.plan_id
      AND pricing_plans.is_active = true
    )
  );

CREATE POLICY "Superadmins can manage pricing plan features"
  ON public.pricing_plan_features
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- RLS Policies for pricing_faqs
CREATE POLICY "Public can view active pricing FAQs"
  ON public.pricing_faqs
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Superadmins can manage pricing FAQs"
  ON public.pricing_faqs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Insert default pricing plans (using DO NOTHING to prevent duplicates on re-run)
INSERT INTO public.pricing_plans (name, price, period, description, cta_text, is_popular, display_order, is_active)
SELECT * FROM (VALUES 
  ('Starter', 'Free', NULL, 'Perfect for getting started', 'Get started', false, 1, true),
  ('Professional', '$29', '/month', 'For growing salons and spas', 'Start free trial', true, 2, true),
  ('Enterprise', 'Custom', NULL, 'For large businesses', 'Contact sales', false, 3, true)
) AS v(name, price, period, description, cta_text, is_popular, display_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_plans WHERE pricing_plans.name = v.name
);

-- Insert default features for Starter plan
INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT 
  id,
  feature,
  row_number() OVER (ORDER BY feature)
FROM (
  SELECT id, 'Up to 50 bookings per month' as feature FROM public.pricing_plans WHERE name = 'Starter'
  UNION ALL
  SELECT id, 'Basic calendar management' FROM public.pricing_plans WHERE name = 'Starter'
  UNION ALL
  SELECT id, 'Online booking widget' FROM public.pricing_plans WHERE name = 'Starter'
  UNION ALL
  SELECT id, 'Email notifications' FROM public.pricing_plans WHERE name = 'Starter'
  UNION ALL
  SELECT id, 'Customer database' FROM public.pricing_plans WHERE name = 'Starter'
  UNION ALL
  SELECT id, 'Basic reporting' FROM public.pricing_plans WHERE name = 'Starter'
) AS features;

-- Insert default features for Professional plan
INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT 
  id,
  feature,
  row_number() OVER (ORDER BY feature)
FROM (
  SELECT id, 'Unlimited bookings' as feature FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Advanced calendar management' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Online booking & payments' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'SMS & email notifications' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Customer database & history' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Advanced reporting & analytics' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Marketing tools' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Staff management' FROM public.pricing_plans WHERE name = 'Professional'
  UNION ALL
  SELECT id, 'Multi-location support' FROM public.pricing_plans WHERE name = 'Professional'
) AS features;

-- Insert default features for Enterprise plan
INSERT INTO public.pricing_plan_features (plan_id, feature_text, display_order)
SELECT 
  id,
  feature,
  row_number() OVER (ORDER BY feature)
FROM (
  SELECT id, 'Everything in Professional' as feature FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'Dedicated account manager' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'Custom integrations' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'Priority support' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'Custom training' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'API access' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'White-label options' FROM public.pricing_plans WHERE name = 'Enterprise'
  UNION ALL
  SELECT id, 'Advanced security' FROM public.pricing_plans WHERE name = 'Enterprise'
) AS features;

-- Insert default FAQs (using WHERE NOT EXISTS to prevent duplicates on re-run)
INSERT INTO public.pricing_faqs (question, answer, display_order, is_active)
SELECT * FROM (VALUES 
  ('Can I change plans later?', 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.', 1, true),
  ('What happens after my free trial?', 'After your 14-day free trial, you''ll be automatically enrolled in the plan you selected. You can cancel anytime before the trial ends with no charges.', 2, true),
  ('Do you offer discounts for annual plans?', 'Yes! Contact our sales team to learn about annual billing discounts and special pricing for multiple locations.', 3, true),
  ('Is there a setup fee?', 'No, there are no setup fees or hidden costs. What you see is what you pay.', 4, true)
) AS v(question, answer, display_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_faqs WHERE pricing_faqs.question = v.question
);

-- Add pricing page hero content to page_content table
INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active)
VALUES 
  ('pricing', 'hero_title', 'text', 'Simple, transparent pricing', '{}', 1, true),
  ('pricing', 'hero_description', 'text', 'Choose the plan that''s right for your business. All plans include a 14-day free trial.', '{}', 2, true)
ON CONFLICT (page_slug, section_key) DO UPDATE
SET content = EXCLUDED.content,
    updated_at = now();
