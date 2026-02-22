-- Beautonomi Database Migration
-- 152_provider_to_client_ratings.sql
-- Creates provider-to-client rating system

-- Provider-to-client ratings table
CREATE TABLE IF NOT EXISTS provider_client_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure one rating per booking
    UNIQUE(booking_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_booking ON provider_client_ratings(booking_id);
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_customer ON provider_client_ratings(customer_id);
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_provider ON provider_client_ratings(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_location ON provider_client_ratings(location_id);
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_rating ON provider_client_ratings(customer_id, rating);
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_visible ON provider_client_ratings(customer_id, is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_provider_client_ratings_created_at ON provider_client_ratings(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_provider_client_ratings_updated_at BEFORE UPDATE ON provider_client_ratings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update customer rating average
CREATE OR REPLACE FUNCTION update_customer_rating()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
BEGIN
    -- Calculate average rating and count for customer
    SELECT 
        COALESCE(AVG(rating), 0),
        COUNT(*)
    INTO v_avg_rating, v_review_count
    FROM provider_client_ratings
    WHERE customer_id = NEW.customer_id
    AND is_visible = true;
    
    -- Update customer's rating_average in users table
    UPDATE users
    SET 
        rating_average = v_avg_rating,
        review_count = v_review_count
    WHERE id = NEW.customer_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update customer rating on rating insert/update
CREATE TRIGGER on_provider_client_rating_created
    AFTER INSERT OR UPDATE ON provider_client_ratings
    FOR EACH ROW
    WHEN (NEW.is_visible = true)
    EXECUTE FUNCTION update_customer_rating();

-- Trigger to update customer rating on rating delete or visibility change
CREATE TRIGGER on_provider_client_rating_deleted_or_hidden
    AFTER DELETE OR UPDATE ON provider_client_ratings
    FOR EACH ROW
    WHEN (OLD.is_visible = true)
    EXECUTE FUNCTION update_customer_rating();

-- Enable Row Level Security
ALTER TABLE provider_client_ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_client_ratings
-- Providers can create ratings for their own bookings
CREATE POLICY "Providers can create ratings for own bookings"
    ON provider_client_ratings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_client_ratings.provider_id
            AND providers.user_id = auth.uid()
        ) AND
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = provider_client_ratings.booking_id
            AND bookings.provider_id = provider_client_ratings.provider_id
            AND bookings.status IN ('completed', 'no_show')
        )
    );

-- Providers can view their own ratings (aggregate only via API)
-- Individual ratings are only visible to superadmin
CREATE POLICY "Providers can view own ratings"
    ON provider_client_ratings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_client_ratings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Providers can update their own ratings
CREATE POLICY "Providers can update own ratings"
    ON provider_client_ratings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_client_ratings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Superadmins can manage all ratings
CREATE POLICY "Superadmins can manage all provider client ratings"
    ON provider_client_ratings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Customers can view their own aggregate ratings (via API, not individual reviews)
-- Individual reviews are hidden from customers
