-- Beautonomi Database Migration
-- 047_footer_links.sql
-- Creates footer links management table for CMS

-- Footer links table
CREATE TABLE IF NOT EXISTS footer_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section TEXT NOT NULL CHECK (section IN ('about', 'business', 'legal', 'social', 'apps')),
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_external BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(section, title, href)
);

-- App download links (separate table for structured data)
CREATE TABLE IF NOT EXISTS footer_app_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(platform)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_footer_links_section ON footer_links(section, is_active, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_footer_app_links_platform ON footer_app_links(platform, is_active) WHERE is_active = true;

-- Create triggers for updated_at
-- Footer links trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'update_footer_links_updated_at'
      AND c.relname = 'footer_links'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'DROP TRIGGER update_footer_links_updated_at ON public.footer_links';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.update_footer_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'update_footer_links_updated_at'
      AND c.relname = 'footer_links'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_footer_links_updated_at
             BEFORE UPDATE ON public.footer_links
             FOR EACH ROW
             EXECUTE FUNCTION public.update_footer_links_updated_at()';
  END IF;
END$$;

-- Footer app links trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'update_footer_app_links_updated_at'
      AND c.relname = 'footer_app_links'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'DROP TRIGGER update_footer_app_links_updated_at ON public.footer_app_links';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.update_footer_app_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'update_footer_app_links_updated_at'
      AND c.relname = 'footer_app_links'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_footer_app_links_updated_at
             BEFORE UPDATE ON public.footer_app_links
             FOR EACH ROW
             EXECUTE FUNCTION public.update_footer_app_links_updated_at()';
  END IF;
END$$;

-- Enable Row Level Security
ALTER TABLE footer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE footer_app_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for footer_links
CREATE POLICY "Public can view active footer links"
    ON footer_links FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage footer links"
    ON footer_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for footer_app_links
CREATE POLICY "Public can view active app links"
    ON footer_app_links FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage app links"
    ON footer_app_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Insert default footer links based on current footer.tsx
-- Using ON CONFLICT to prevent duplicates if migration is run multiple times
INSERT INTO footer_links (section, title, href, display_order, is_external, is_active) VALUES
    -- About Beautonomi
    ('about', 'Careers', '/career', 1, false, true),
    ('about', 'Customer Support', '/help', 2, false, true),
    ('about', 'Blog', '/news', 3, false, true),
    ('about', 'Sitemap', '/sitemap', 4, false, true),
    
    -- For Business
    ('business', 'For Partners', '/become-a-partner', 1, false, true),
    ('business', 'Pricing', '/resources', 2, false, true),
    ('business', 'Support', '/help', 3, false, true),
    
    -- Legal
    ('legal', 'Privacy Policy', '/privacy-policy', 1, false, true),
    ('legal', 'Terms of Service', '/terms-and-condition', 2, false, true),
    ('legal', 'Terms of use', '/terms-and-condition', 3, false, true),
    
    -- Social Media
    ('social', 'Facebook', 'https://facebook.com', 1, true, true),
    ('social', 'Twitter', 'https://twitter.com', 2, true, true),
    ('social', 'LinkedIn', 'https://linkedin.com', 3, true, true),
    ('social', 'Instagram', 'https://instagram.com', 4, true, true)
ON CONFLICT (section, title, href) DO NOTHING;

-- Insert default app links
INSERT INTO footer_app_links (platform, title, href, display_order, is_active) VALUES
    ('android', 'Download app from Google Play Store', '#', 1, true),
    ('ios', 'Download app from iOS App Store', '#', 2, true)
ON CONFLICT (platform) DO NOTHING;
