-- Create about_us_content table for managing About Us modal content
CREATE TABLE IF NOT EXISTS public.about_us_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_about_us_content_section ON public.about_us_content(section_key);
CREATE INDEX IF NOT EXISTS idx_about_us_content_active ON public.about_us_content(is_active, display_order) WHERE is_active = true;

-- Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_about_us_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS update_about_us_content_updated_at ON public.about_us_content;
CREATE TRIGGER update_about_us_content_updated_at
  BEFORE UPDATE ON public.about_us_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_about_us_content_updated_at();

-- Enable RLS
ALTER TABLE public.about_us_content ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can view active content
CREATE POLICY "Public can view active about us content"
  ON public.about_us_content
  FOR SELECT
  TO public
  USING (is_active = true);

-- Superadmins can manage all content
CREATE POLICY "Superadmins can manage about us content"
  ON public.about_us_content
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

-- Insert default about us content
INSERT INTO public.about_us_content (section_key, title, content, display_order, is_active)
VALUES 
  ('mission', 'Our Mission', 'Beautonomi is a revolutionary beauty service marketplace connecting customers with verified beauty professionals across Africa. We''re dedicated to making beauty services accessible, convenient, and safe for everyone.', 1, true),
  ('what_we_do', 'What We Do', 'We provide a platform where customers can discover, book, and pay for beauty services from salons, spas, and independent beauty professionals. From haircuts to spa treatments, we connect you with the best beauty services in your area.', 2, true),
  ('for_professionals', 'For Beauty Professionals', 'Beautonomi helps beauty professionals grow their business by connecting them with customers, managing bookings, and handling payments. Join thousands of beauty professionals who trust Beautonomi to power their business.', 3, true),
  ('safety_trust', 'Safety & Trust', 'Your safety is our priority. All beauty professionals on our platform are verified, and we provide secure payment processing, customer reviews, and 24/7 support.', 4, true),
  ('contact_intro', 'Contact Us', 'Have questions or feedback? We''d love to hear from you!', 5, true),
  ('contact_email', 'Email', 'support@beautonomi.com', 6, true),
  ('contact_phone', 'Phone', '+27 (0) 11 123 4567', 7, true),
  ('contact_help_center', 'Help Center', 'beautonomi.com/help', 8, true)
ON CONFLICT (section_key) DO NOTHING;
