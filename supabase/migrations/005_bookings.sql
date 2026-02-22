-- Beautonomi Database Migration
-- 005_bookings.sql
-- Creates booking-related tables

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    status booking_status NOT NULL DEFAULT 'pending',
    location_type location_type NOT NULL,
    location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL, -- For at_salon
    address_line1 TEXT, -- For at_home
    address_line2 TEXT,
    address_city TEXT,
    address_state TEXT,
    address_country TEXT,
    address_postal_code TEXT,
    address_latitude NUMERIC(10, 8),
    address_longitude NUMERIC(11, 8),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    package_id UUID REFERENCES service_packages(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    tip_amount NUMERIC(10, 2) DEFAULT 0 CHECK (tip_amount >= 0),
    discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    payment_status payment_status NOT NULL DEFAULT 'pending',
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    special_requests TEXT,
    loyalty_points_earned INTEGER DEFAULT 0,
    loyalty_points_used INTEGER DEFAULT 0,
    -- At-home booking specific fields
    current_stage TEXT CHECK (current_stage IN ('confirmed', 'provider_on_way', 'provider_arrived', 'service_started', 'service_completed')),
    arrival_otp TEXT,
    arrival_otp_expires_at TIMESTAMP WITH TIME ZONE,
    arrival_otp_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Booking services (services within a booking)
CREATE TABLE IF NOT EXISTS booking_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    offering_id UUID NOT NULL REFERENCES offerings(id),
    staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
    guest_name TEXT, -- For multiple guests
    guest_email TEXT,
    guest_phone TEXT,
    duration_minutes INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    scheduled_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start_at TIMESTAMP WITH TIME ZONE,
    actual_end_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Booking addons
CREATE TABLE IF NOT EXISTS booking_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES service_addons(id),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Booking events (lifecycle tracking)
CREATE TABLE IF NOT EXISTS booking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Additional charges (for at-home services)
CREATE TABLE IF NOT EXISTS additional_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    requested_by UUID NOT NULL REFERENCES users(id), -- Provider user ID
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Availability blocks (for calendar management)
CREATE TABLE IF NOT EXISTS availability_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE CASCADE, -- Null for all staff
    location_id UUID REFERENCES provider_locations(id) ON DELETE CASCADE, -- Null for all locations
    block_type TEXT NOT NULL CHECK (block_type IN ('unavailable', 'break', 'maintenance')),
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern JSONB, -- For recurring blocks
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_at > start_at)
);

-- Wishlists (saved providers/services)
CREATE TABLE IF NOT EXISTS wishlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wishlist items
CREATE TABLE IF NOT EXISTS wishlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('provider', 'offering', 'package')),
    item_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wishlist_id, item_type, item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number ON bookings(booking_number);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status ON bookings(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status ON bookings(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_booking_services_booking ON booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_offering ON booking_services(offering_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_staff ON booking_services(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_services_scheduled ON booking_services(scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_booking_addons_booking ON booking_addons(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_type ON booking_events(booking_id, event_type);
CREATE INDEX IF NOT EXISTS idx_additional_charges_booking ON additional_charges(booking_id);
CREATE INDEX IF NOT EXISTS idx_additional_charges_status ON additional_charges(status);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_provider ON availability_blocks(provider_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_staff ON availability_blocks(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_availability_blocks_dates ON availability_blocks(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);

-- Create triggers for updated_at
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_services_updated_at BEFORE UPDATE ON booking_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_additional_charges_updated_at BEFORE UPDATE ON additional_charges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_blocks_updated_at BEFORE UPDATE ON availability_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wishlists_updated_at BEFORE UPDATE ON wishlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE additional_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookings
CREATE POLICY "Customers can view own bookings"
    ON bookings FOR SELECT
    USING (customer_id = auth.uid());

CREATE POLICY "Customers can create own bookings"
    ON bookings FOR INSERT
    WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own bookings"
    ON bookings FOR UPDATE
    USING (customer_id = auth.uid());

CREATE POLICY "Providers can view own provider bookings"
    ON bookings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = bookings.provider_id
            AND (providers.user_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM provider_staff
                     WHERE provider_staff.provider_id = providers.id
                     AND provider_staff.user_id = auth.uid()
                 ))
        )
    );

CREATE POLICY "Providers can update own provider bookings"
    ON bookings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = bookings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Superadmins can view all bookings"
    ON bookings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for booking_services
CREATE POLICY "Users can view booking services for accessible bookings"
    ON booking_services FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_services.booking_id
            AND (
                bookings.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                ) OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

-- RLS Policies for booking_addons
CREATE POLICY "Users can view booking addons for accessible bookings"
    ON booking_addons FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_addons.booking_id
            AND (
                bookings.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND providers.user_id = auth.uid()
                ) OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

-- RLS Policies for booking_events
CREATE POLICY "Users can view booking events for accessible bookings"
    ON booking_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_events.booking_id
            AND (
                bookings.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND providers.user_id = auth.uid()
                ) OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

CREATE POLICY "Users can create booking events for accessible bookings"
    ON booking_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_events.booking_id
            AND (
                bookings.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND providers.user_id = auth.uid()
                )
            )
        )
    );

-- RLS Policies for additional_charges
CREATE POLICY "Users can view additional charges for accessible bookings"
    ON additional_charges FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = additional_charges.booking_id
            AND (
                bookings.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND providers.user_id = auth.uid()
                ) OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

CREATE POLICY "Providers can create additional charges for own bookings"
    ON additional_charges FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = additional_charges.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Customers can update own booking additional charges"
    ON additional_charges FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = additional_charges.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

-- RLS Policies for availability_blocks
CREATE POLICY "Providers can manage own availability blocks"
    ON availability_blocks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = availability_blocks.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for wishlists
CREATE POLICY "Users can manage own wishlists"
    ON wishlists FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Public can view public wishlists"
    ON wishlists FOR SELECT
    USING (is_public = true);

-- RLS Policies for wishlist_items
CREATE POLICY "Users can manage items in own wishlists"
    ON wishlist_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM wishlists
            WHERE wishlists.id = wishlist_items.wishlist_id
            AND wishlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Public can view items in public wishlists"
    ON wishlist_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wishlists
            WHERE wishlists.id = wishlist_items.wishlist_id
            AND wishlists.is_public = true
        )
    );
