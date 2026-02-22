-- Beautonomi Database Migration
-- 009_content.sql
-- Creates CMS and content-related tables

-- Page content table (CMS)
CREATE TABLE IF NOT EXISTS page_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_slug TEXT NOT NULL,
    section_key TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('text', 'html', 'json', 'image', 'video')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_slug, section_key)
);

-- FAQs table
CREATE TABLE IF NOT EXISTS faqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resources table (help articles)
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    thumbnail_url TEXT,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Featured cities table
CREATE TABLE IF NOT EXISTS featured_cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    city_code TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    image_urls TEXT[] DEFAULT '{}',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(country_code, city_code)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_page_content_slug ON page_content(page_slug);
CREATE INDEX IF NOT EXISTS idx_page_content_active ON page_content(page_slug, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_faqs_order ON faqs(display_order);
CREATE INDEX IF NOT EXISTS idx_resources_slug ON resources(slug);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resources_published ON resources(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_resources_tags ON resources USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_featured_cities_country ON featured_cities(country_code);
CREATE INDEX IF NOT EXISTS idx_featured_cities_active ON featured_cities(is_active, display_order) WHERE is_active = true;

-- Create triggers for updated_at
CREATE TRIGGER update_page_content_updated_at BEFORE UPDATE ON page_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faqs_updated_at BEFORE UPDATE ON faqs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_featured_cities_updated_at BEFORE UPDATE ON featured_cities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE page_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_cities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for page_content
CREATE POLICY "Public can view active page content"
    ON page_content FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage page content"
    ON page_content FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for faqs
CREATE POLICY "Public can view active FAQs"
    ON faqs FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage FAQs"
    ON faqs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for resources
CREATE POLICY "Public can view published resources"
    ON resources FOR SELECT
    USING (is_published = true);

CREATE POLICY "Superadmins can manage all resources"
    ON resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for featured_cities
CREATE POLICY "Public can view active featured cities"
    ON featured_cities FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage featured cities"
    ON featured_cities FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
