-- Beautonomi Database Migration
-- 117_create_booking_products.sql
-- Creates booking_products table to link bookings with retail products

-- Create booking_products table (similar to booking_services and booking_addons)
CREATE TABLE IF NOT EXISTS booking_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_products_booking ON booking_products(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_products_product ON booking_products(product_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_booking_products_updated_at ON booking_products;
CREATE TRIGGER update_booking_products_updated_at BEFORE UPDATE ON booking_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE booking_products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view booking products for accessible bookings" ON booking_products;
DROP POLICY IF EXISTS "Users can create booking products for accessible bookings" ON booking_products;
DROP POLICY IF EXISTS "Users can update booking products for accessible bookings" ON booking_products;
DROP POLICY IF EXISTS "Users can delete booking products for accessible bookings" ON booking_products;

-- RLS Policies for booking_products
CREATE POLICY "Users can view booking products for accessible bookings"
    ON booking_products FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_products.booking_id
            AND (
                -- Customer can view their own bookings
                bookings.customer_id = auth.uid() 
                OR
                -- Provider owner can view bookings for their provider
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND (providers.user_id = auth.uid() OR
                         -- Provider staff can view bookings for their provider
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
                OR
                -- Superadmin can view all bookings
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

CREATE POLICY "Users can create booking products for accessible bookings"
    ON booking_products FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_products.booking_id
            AND (
                bookings.customer_id = auth.uid() 
                OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND providers.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update booking products for accessible bookings"
    ON booking_products FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_products.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete booking products for accessible bookings"
    ON booking_products FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_products.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

-- Add comment to table
COMMENT ON TABLE booking_products IS 'Links bookings to retail products purchased during the booking';
COMMENT ON COLUMN booking_products.unit_price IS 'Price per unit at the time of booking (may differ from current product price)';
COMMENT ON COLUMN booking_products.total_price IS 'Total price for all units (unit_price * quantity)';
