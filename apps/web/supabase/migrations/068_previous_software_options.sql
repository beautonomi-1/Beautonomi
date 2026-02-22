-- Previous Software Options Table
-- Allows superadmins to manage the list of salon software options for onboarding analytics
-- This data helps understand where customers are coming from

CREATE TABLE IF NOT EXISTS public.previous_software_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- Display name (e.g., "Mangomint", "Fresha")
  slug TEXT NOT NULL UNIQUE, -- URL-friendly identifier (e.g., "mangomint", "fresha")
  display_order INTEGER DEFAULT 0, -- Order in dropdown
  is_active BOOLEAN DEFAULT true, -- Whether to show in dropdown
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_previous_software_options_active ON public.previous_software_options(is_active);
CREATE INDEX IF NOT EXISTS idx_previous_software_options_display_order ON public.previous_software_options(display_order);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_previous_software_options_updated_at ON public.previous_software_options;
CREATE TRIGGER update_previous_software_options_updated_at
  BEFORE UPDATE ON public.previous_software_options
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.previous_software_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can read active options (for onboarding form)
DROP POLICY IF EXISTS "Public can read active previous software options" ON public.previous_software_options;
CREATE POLICY "Public can read active previous software options"
  ON public.previous_software_options FOR SELECT
  TO public
  USING (is_active = true);

-- Superadmins can manage all options
DROP POLICY IF EXISTS "Superadmins can manage previous software options" ON public.previous_software_options;
CREATE POLICY "Superadmins can manage previous software options"
  ON public.previous_software_options FOR ALL
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

-- Seed initial data (common salon software)
INSERT INTO public.previous_software_options (name, slug, display_order, is_active) VALUES
  ('None / First time using salon software', 'none', 0, true),
  ('Mangomint', 'mangomint', 1, true),
  ('Fresha', 'fresha', 2, true),
  ('Booksy', 'booksy', 3, true),
  ('Square Appointments', 'square_appointments', 4, true),
  ('Acuity Scheduling', 'acuity', 5, true),
  ('Mindbody', 'mindbody', 6, true),
  ('GlossGenius', 'glossgenius', 7, true),
  ('Schedulicity', 'schedulicity', 8, true),
  ('Vagaro', 'vagaro', 9, true),
  ('Salon Iris', 'salon_iris', 10, true),
  ('Phorest', 'phorest', 11, true),
  ('Zenoti', 'zenoti', 12, true),
  ('Mio', 'mio', 13, true),
  ('Other (please specify)', 'other', 99, true)
ON CONFLICT (slug) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.previous_software_options IS 'List of salon software options for provider onboarding. Managed by superadmins to track where customers are coming from.';
