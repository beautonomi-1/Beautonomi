-- Fix infinite recursion in reviews INSERT RLS policy.
-- Root cause: policy queried reviews from within reviews policy evaluation.
-- Keep ownership + completed-booking checks, and rely on UNIQUE(booking_id)
-- plus API pre-check for one-review-per-booking enforcement.

DROP POLICY IF EXISTS "Customers can create reviews for own bookings" ON reviews;

CREATE POLICY "Customers can create reviews for own bookings"
    ON reviews FOR INSERT
    WITH CHECK (
        customer_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM bookings b
            WHERE b.id = booking_id
              AND b.customer_id = auth.uid()
              AND b.status = 'completed'
        )
    );
