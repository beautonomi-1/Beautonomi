-- Create footer_settings table for managing footer text content
CREATE TABLE IF NOT EXISTS public.footer_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_footer_settings_key ON public.footer_settings(key);

-- Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_footer_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS update_footer_settings_updated_at ON public.footer_settings;
CREATE TRIGGER update_footer_settings_updated_at
  BEFORE UPDATE ON public.footer_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_footer_settings_updated_at();

-- Enable RLS
ALTER TABLE public.footer_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can view active settings
CREATE POLICY "Public can view footer settings"
  ON public.footer_settings
  FOR SELECT
  TO public
  USING (true);

-- Superadmins can manage all settings
CREATE POLICY "Superadmins can manage footer settings"
  ON public.footer_settings
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

-- Insert default footer settings
INSERT INTO public.footer_settings (key, value, description)
VALUES 
  ('social_label', 'Find us on social:', 'Label text displayed before social media links'),
  ('copyright_text', '© 2024 Beautonomi. All rights reserved.', 'Copyright text displayed in footer')
ON CONFLICT (key) DO NOTHING;
