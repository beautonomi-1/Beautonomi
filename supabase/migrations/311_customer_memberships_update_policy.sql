-- Allow customers to update their own customer_memberships row (e.g. to cancel)
DROP POLICY IF EXISTS "Customers can update own memberships" ON customer_memberships;
CREATE POLICY "Customers can update own memberships"
    ON customer_memberships FOR UPDATE
    USING (customer_id = auth.uid())
    WITH CHECK (customer_id = auth.uid());
