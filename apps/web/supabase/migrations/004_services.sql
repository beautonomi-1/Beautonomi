-- Beautonomi Database Migration
-- 004_services.sql
-- Creates service-related tables

-- Global service categories (platform-wide)
CREATE TABLE IF NOT EXISTS global_service_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT, -- Emoji or icon identifier
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subcategories
CREATE TABLE IF NOT EXISTS subcategories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES global_service_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category_id, slug)
);

-- Provider global category associations
CREATE TABLE IF NOT EXISTS provider_global_category_associations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    global_category_id UUID NOT NULL REFERENCES global_service_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, global_category_id)
);

-- Provider categories (provider-specific)
CREATE TABLE IF NOT EXISTS provider_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, slug)
);

-- Master services (platform-wide service catalog)
CREATE TABLE IF NOT EXISTS master_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES global_service_categories(id),
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    default_duration_minutes INTEGER NOT NULL DEFAULT 60,
    default_buffer_minutes INTEGER DEFAULT 15,
    allowed_location_types TEXT[] DEFAULT ARRAY['at_salon', 'at_home']::TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service category links
CREATE TABLE IF NOT EXISTS service_category_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL,
    service_type service_type NOT NULL,
    global_category_id UUID REFERENCES global_service_categories(id) ON DELETE CASCADE,
    provider_category_id UUID REFERENCES provider_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (
        (global_category_id IS NOT NULL AND provider_category_id IS NULL) OR
        (global_category_id IS NULL AND provider_category_id IS NOT NULL)
    )
);

-- Offerings (provider-specific service offerings)
CREATE TABLE IF NOT EXISTS offerings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    master_service_id UUID REFERENCES master_services(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES global_service_categories(id),
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
    buffer_minutes INTEGER DEFAULT 15,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    supports_at_home BOOLEAN DEFAULT false,
    supports_at_salon BOOLEAN DEFAULT true,
    at_home_radius_km NUMERIC(10, 2),
    at_home_price_adjustment NUMERIC(10, 2) DEFAULT 0,
    thumbnail_url TEXT,
    images TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service packages (bundled services)
CREATE TABLE IF NOT EXISTS service_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    discount_percentage NUMERIC(5, 2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service package items
CREATE TABLE IF NOT EXISTS service_package_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(package_id, offering_id)
);

-- Service add-ons
CREATE TABLE IF NOT EXISTS service_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    offering_id UUID REFERENCES offerings(id) ON DELETE CASCADE, -- Null for global addons
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    duration_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_global_categories_featured ON global_service_categories(is_featured, is_active) WHERE is_featured = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_global_categories_slug ON global_service_categories(slug);
CREATE INDEX IF NOT EXISTS idx_global_categories_active ON global_service_categories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_provider_global_cat_provider ON provider_global_category_associations(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_global_cat_category ON provider_global_category_associations(global_category_id);
CREATE INDEX IF NOT EXISTS idx_provider_categories_provider ON provider_categories(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_categories_active ON provider_categories(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_master_services_category ON master_services(category_id);
CREATE INDEX IF NOT EXISTS idx_master_services_active ON master_services(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_category_links_service ON service_category_links(service_id, service_type);
CREATE INDEX IF NOT EXISTS idx_offerings_provider ON offerings(provider_id);
CREATE INDEX IF NOT EXISTS idx_offerings_master_service ON offerings(master_service_id) WHERE master_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offerings_category ON offerings(category_id);
CREATE INDEX IF NOT EXISTS idx_offerings_active ON offerings(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_packages_provider ON service_packages(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_package_items_package ON service_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_service_package_items_offering ON service_package_items(offering_id);
CREATE INDEX IF NOT EXISTS idx_service_addons_provider ON service_addons(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_addons_offering ON service_addons(offering_id) WHERE offering_id IS NOT NULL;

-- Create triggers for updated_at
CREATE TRIGGER update_global_categories_updated_at BEFORE UPDATE ON global_service_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subcategories_updated_at BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_categories_updated_at BEFORE UPDATE ON provider_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_services_updated_at BEFORE UPDATE ON master_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offerings_updated_at BEFORE UPDATE ON offerings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_packages_updated_at BEFORE UPDATE ON service_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_addons_updated_at BEFORE UPDATE ON service_addons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE global_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_global_category_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_category_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for global_service_categories
CREATE POLICY "Public can view active global categories"
    ON global_service_categories FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage global categories"
    ON global_service_categories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for subcategories
CREATE POLICY "Public can view active subcategories"
    ON subcategories FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage subcategories"
    ON subcategories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for provider_global_category_associations
CREATE POLICY "Public can view provider category associations"
    ON provider_global_category_associations FOR SELECT
    USING (true);

CREATE POLICY "Providers can manage own category associations"
    ON provider_global_category_associations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_global_category_associations.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for provider_categories
CREATE POLICY "Public can view active provider categories"
    ON provider_categories FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_categories.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own categories"
    ON provider_categories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_categories.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for master_services
CREATE POLICY "Public can view active master services"
    ON master_services FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage master services"
    ON master_services FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for service_category_links
CREATE POLICY "Public can view service category links"
    ON service_category_links FOR SELECT
    USING (true);

CREATE POLICY "Providers can manage links for own services"
    ON service_category_links FOR ALL
    USING (
        (service_type = 'offering' AND EXISTS (
            SELECT 1 FROM offerings
            WHERE offerings.id = service_category_links.service_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = offerings.provider_id
                AND providers.user_id = auth.uid()
            )
        )) OR
        (service_type = 'master_service' AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        ))
    );

-- RLS Policies for offerings
CREATE POLICY "Public can view active offerings of active providers"
    ON offerings FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = offerings.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own offerings"
    ON offerings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = offerings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for service_packages
CREATE POLICY "Public can view active packages of active providers"
    ON service_packages FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = service_packages.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own packages"
    ON service_packages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = service_packages.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for service_package_items
CREATE POLICY "Public can view package items"
    ON service_package_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_packages
            WHERE service_packages.id = service_package_items.package_id
            AND service_packages.is_active = true
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = service_packages.provider_id
                AND providers.status = 'active'
            )
        )
    );

CREATE POLICY "Providers can manage own package items"
    ON service_package_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM service_packages
            WHERE service_packages.id = service_package_items.package_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = service_packages.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

-- RLS Policies for service_addons
CREATE POLICY "Public can view active addons of active providers"
    ON service_addons FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = service_addons.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own addons"
    ON service_addons FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = service_addons.provider_id
            AND providers.user_id = auth.uid()
        )
    );
