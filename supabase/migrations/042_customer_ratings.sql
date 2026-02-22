-- Beautonomi Database Migration
-- 042_customer_ratings.sql
-- Adds customer rating functionality

-- Add customer rating fields to reviews table
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating IS NULL OR (customer_rating >= 1 AND customer_rating <= 5)),
ADD COLUMN IF NOT EXISTS customer_comment TEXT,
ADD COLUMN IF NOT EXISTS customer_rating_created_at TIMESTAMP WITH TIME ZONE;

-- Add customer rating fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS rating_average NUMERIC(3, 2) DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0 CHECK (review_count >= 0);

-- Create index for customer ratings
CREATE INDEX IF NOT EXISTS idx_reviews_customer_rating ON reviews(customer_id, customer_rating) WHERE customer_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_rating_average ON users(rating_average) WHERE rating_average > 0;

-- Function to update customer rating average
CREATE OR REPLACE FUNCTION update_customer_rating()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
    v_customer_id UUID;
BEGIN
    -- Determine which customer_id to update
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD.customer_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If rating was removed or changed, update based on OLD customer_id
        IF OLD.customer_rating IS NOT NULL THEN
            v_customer_id := OLD.customer_id;
        END IF;
        -- If new rating is set, also update based on NEW customer_id
        IF NEW.customer_rating IS NOT NULL THEN
            v_customer_id := NEW.customer_id;
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.customer_rating IS NOT NULL THEN
            v_customer_id := NEW.customer_id;
        END IF;
    END IF;

    -- Only proceed if we have a customer_id to update
    IF v_customer_id IS NOT NULL THEN
        -- Calculate average rating and count for the customer
        SELECT 
            COALESCE(AVG(customer_rating), 0),
            COUNT(*)
        INTO v_avg_rating, v_review_count
        FROM reviews
        WHERE customer_id = v_customer_id
        AND customer_rating IS NOT NULL;
        
        -- Update user
        UPDATE users
        SET 
            rating_average = v_avg_rating,
            review_count = v_review_count
        WHERE id = v_customer_id;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update customer rating on review insert/update/delete
CREATE TRIGGER on_customer_rating_changed
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_rating();

-- Update existing customer ratings if any exist (for backward compatibility)
DO $$
DECLARE
    customer_record RECORD;
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
BEGIN
    FOR customer_record IN 
        SELECT DISTINCT customer_id 
        FROM reviews 
        WHERE customer_rating IS NOT NULL
    LOOP
        SELECT 
            COALESCE(AVG(customer_rating), 0),
            COUNT(*)
        INTO v_avg_rating, v_review_count
        FROM reviews
        WHERE customer_id = customer_record.customer_id
        AND customer_rating IS NOT NULL;
        
        UPDATE users
        SET 
            rating_average = v_avg_rating,
            review_count = v_review_count
        WHERE id = customer_record.customer_id;
    END LOOP;
END $$;

-- RLS Policies for customer ratings
-- Providers can rate customers for their bookings
CREATE POLICY "Providers can rate customers for own bookings"
    ON reviews FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = reviews.provider_id
            AND providers.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = reviews.booking_id
            AND bookings.provider_id = reviews.provider_id
            AND bookings.status = 'completed'
        )
    )
    WITH CHECK (
        customer_rating IS NULL OR (customer_rating >= 1 AND customer_rating <= 5)
    );

-- Providers can view customer ratings for their bookings
CREATE POLICY "Providers can view customer ratings"
    ON reviews FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = reviews.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Customers can view their own ratings
CREATE POLICY "Customers can view own ratings"
    ON reviews FOR SELECT
    USING (customer_id = auth.uid());

-- Add comment for customer rating fields
COMMENT ON COLUMN reviews.customer_rating IS 'Rating given by provider to customer (1-5 stars)';
COMMENT ON COLUMN reviews.customer_comment IS 'Comment from provider about the customer';
COMMENT ON COLUMN users.rating_average IS 'Average rating received by customer from providers';
COMMENT ON COLUMN users.review_count IS 'Total number of ratings received by customer from providers';
