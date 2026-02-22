-- Beautonomi Database Migration
-- 153_update_reviews_rls_for_providers.sql
-- Updates RLS policies so providers can only see aggregate reviews, not individual ones

-- Drop the existing policy that allows providers to view individual reviews
DROP POLICY IF EXISTS "Providers can view reviews for own business" ON reviews;

-- Providers can still respond to reviews (they know the review exists, just can't see the full content)
-- But they can't SELECT individual reviews - only superadmin can
-- The API will provide aggregate statistics instead

-- Note: The existing policy "Providers can respond to own reviews" allows UPDATE
-- but we need to ensure they can't SELECT to see the review content
-- The response will be handled via a separate API endpoint that doesn't expose the review content

-- Keep the response policy but ensure it doesn't allow SELECT
-- The UPDATE policy already exists and is fine for responses

-- Superadmins can still see all individual reviews (policy already exists)
