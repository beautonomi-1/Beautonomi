-- Fix INSERT policy: NOT EXISTS compared booking_id to itself (always true), so duplicate reviews were not blocked at RLS.
DROP POLICY IF EXISTS "Customers can create reviews for own bookings" ON reviews;

CREATE POLICY "Customers can create reviews for own bookings"
    ON reviews FOR INSERT
    WITH CHECK (
        customer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = booking_id
            AND b.customer_id = auth.uid()
            AND b.status = 'completed'
        ) AND
        NOT EXISTS (
            SELECT 1 FROM reviews r
            WHERE r.booking_id = booking_id
        )
    );
