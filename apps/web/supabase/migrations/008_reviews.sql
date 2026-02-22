-- Beautonomi Database Migration
-- 008_reviews.sql
-- Creates review-related tables

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    service_ratings JSONB DEFAULT '[]', -- [{offering_id, rating}, ...]
    staff_rating JSONB, -- {staff_id, rating}
    provider_response TEXT,
    provider_response_at TIMESTAMP WITH TIME ZONE,
    is_verified BOOLEAN DEFAULT false, -- Verified booking
    is_flagged BOOLEAN DEFAULT false,
    flagged_reason TEXT,
    flagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_visible BOOLEAN DEFAULT true,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS review_helpful_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews(booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(provider_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_visible ON reviews(provider_id, is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_review ON review_helpful_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_user ON review_helpful_votes(user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update provider rating average
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
BEGIN
    -- Calculate average rating and count
    SELECT 
        COALESCE(AVG(rating), 0),
        COUNT(*)
    INTO v_avg_rating, v_review_count
    FROM reviews
    WHERE provider_id = NEW.provider_id
    AND is_visible = true;
    
    -- Update provider
    UPDATE providers
    SET 
        rating_average = v_avg_rating,
        review_count = v_review_count
    WHERE id = NEW.provider_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update provider rating on review insert/update
CREATE TRIGGER on_review_created
    AFTER INSERT OR UPDATE ON reviews
    FOR EACH ROW
    WHEN (NEW.is_visible = true)
    EXECUTE FUNCTION update_provider_rating();

-- Trigger to update provider rating on review delete or visibility change
CREATE TRIGGER on_review_deleted_or_hidden
    AFTER DELETE OR UPDATE ON reviews
    FOR EACH ROW
    WHEN (OLD.is_visible = true)
    EXECUTE FUNCTION update_provider_rating();

-- Function to update helpful count
CREATE OR REPLACE FUNCTION update_review_helpful_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE reviews
    SET helpful_count = (
        SELECT COUNT(*)
        FROM review_helpful_votes
        WHERE review_id = NEW.review_id
        AND is_helpful = true
    )
    WHERE id = NEW.review_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update helpful count
CREATE TRIGGER on_helpful_vote_created
    AFTER INSERT OR UPDATE OR DELETE ON review_helpful_votes
    FOR EACH ROW EXECUTE FUNCTION update_review_helpful_count();

-- Enable Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
CREATE POLICY "Public can view visible reviews"
    ON reviews FOR SELECT
    USING (
        is_visible = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = reviews.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Customers can view own reviews"
    ON reviews FOR SELECT
    USING (customer_id = auth.uid());

CREATE POLICY "Customers can create reviews for own bookings"
    ON reviews FOR INSERT
    WITH CHECK (
        customer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = reviews.booking_id
            AND bookings.customer_id = auth.uid()
            AND bookings.status = 'completed'
        ) AND
        NOT EXISTS (
            SELECT 1 FROM reviews
            WHERE reviews.booking_id = reviews.booking_id
        )
    );

CREATE POLICY "Customers can update own reviews"
    ON reviews FOR UPDATE
    USING (customer_id = auth.uid());

CREATE POLICY "Providers can view reviews for own business"
    ON reviews FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = reviews.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can respond to own reviews"
    ON reviews FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = reviews.provider_id
            AND providers.user_id = auth.uid()
        )
    )
    WITH CHECK (
        provider_response IS NOT NULL OR
        provider_response_at IS NOT NULL
    );

CREATE POLICY "Superadmins can manage all reviews"
    ON reviews FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for review_helpful_votes
CREATE POLICY "Users can manage own helpful votes"
    ON review_helpful_votes FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Public can view helpful votes"
    ON review_helpful_votes FOR SELECT
    USING (true);
