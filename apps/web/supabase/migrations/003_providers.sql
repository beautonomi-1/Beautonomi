-- Beautonomi Database Migration
-- 003_providers.sql
-- Creates provider-related tables

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    business_type business_type NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    status provider_status NOT NULL DEFAULT 'draft',
    is_verified BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    thumbnail_url TEXT,
    gallery TEXT[] DEFAULT '{}',
    years_in_business INTEGER,
    cancellation_window_hours INTEGER DEFAULT 24,
    requires_deposit BOOLEAN DEFAULT false,
    deposit_percentage NUMERIC(5, 2),
    no_show_fee_enabled BOOLEAN DEFAULT false,
    no_show_fee_amount NUMERIC(10, 2),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    rating_average NUMERIC(3, 2) DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
    review_count INTEGER DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    total_earnings NUMERIC(10, 2) DEFAULT 0,
    subscription_plan_id UUID, -- References subscription_plans
    subscription_status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'cancelled', 'expired'
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider locations table
CREATE TABLE IF NOT EXISTS provider_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    country TEXT NOT NULL,
    postal_code TEXT,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    working_hours JSONB DEFAULT '{}', -- {monday: {is_open: true, open_time: "09:00", close_time: "17:00"}, ...}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider staff table
CREATE TABLE IF NOT EXISTS provider_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Null if not a registered user
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'employee')),
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{}',
    commission_percentage NUMERIC(5, 2) DEFAULT 0,
    service_ids UUID[] DEFAULT '{}', -- Offering IDs this staff can perform
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service zones table (for at-home services)
CREATE TABLE IF NOT EXISTS service_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    zone_type TEXT NOT NULL CHECK (zone_type IN ('radius', 'polygon')),
    center_latitude NUMERIC(10, 8), -- For radius zones
    center_longitude NUMERIC(11, 8), -- For radius zones
    radius_km NUMERIC(10, 2), -- For radius zones
    polygon_coordinates JSONB, -- For polygon zones: [[lat, lng], [lat, lng], ...]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly NUMERIC(10, 2) NOT NULL,
    price_yearly NUMERIC(10, 2),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    features JSONB DEFAULT '{}', -- {max_locations: 1, max_staff: 3, analytics: true, ...}
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider subscriptions
CREATE TABLE IF NOT EXISTS provider_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    payment_method_id UUID REFERENCES payment_methods(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug);
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_featured ON providers(is_featured, status) WHERE is_featured = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_providers_verified ON providers(is_verified, status) WHERE is_verified = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_provider_locations_provider ON provider_locations(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_locations_active ON provider_locations(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_provider_staff_provider ON provider_staff(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_user ON provider_staff(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_staff_active ON provider_staff(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_zones_provider ON service_zones(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_zones_active ON service_zones(provider_id, is_active) WHERE is_active = true;

-- Create triggers for updated_at
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_locations_updated_at BEFORE UPDATE ON provider_locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_staff_updated_at BEFORE UPDATE ON provider_staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_zones_updated_at BEFORE UPDATE ON service_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_subscriptions_updated_at BEFORE UPDATE ON provider_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for providers
CREATE POLICY "Public can view active providers"
    ON providers FOR SELECT
    USING (status = 'active');

CREATE POLICY "Providers can view own profile"
    ON providers FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.provider_id = providers.id
            AND provider_staff.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can update own profile"
    ON providers FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Superadmins can manage all providers"
    ON providers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for provider_locations
CREATE POLICY "Public can view active provider locations"
    ON provider_locations FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_locations.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own locations"
    ON provider_locations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_locations.provider_id
            AND (providers.user_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM provider_staff
                     WHERE provider_staff.provider_id = providers.id
                     AND provider_staff.user_id = auth.uid()
                 ))
        )
    );

-- RLS Policies for provider_staff
CREATE POLICY "Public can view active staff of active providers"
    ON provider_staff FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_staff.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own staff"
    ON provider_staff FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_staff.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Staff can view own profile"
    ON provider_staff FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policies for service_zones
CREATE POLICY "Providers can manage own service zones"
    ON service_zones FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = service_zones.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for subscription_plans
CREATE POLICY "Public can view active subscription plans"
    ON subscription_plans FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage subscription plans"
    ON subscription_plans FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for provider_subscriptions
CREATE POLICY "Providers can view own subscription"
    ON provider_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_subscriptions.provider_id
            AND providers.user_id = auth.uid()
        )
    );
