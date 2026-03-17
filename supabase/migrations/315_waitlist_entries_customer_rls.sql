-- Customers can read and delete their own waitlist entries (for /api/me/waitlist).
-- Providers keep full access via existing policy.

DROP POLICY IF EXISTS "Customers can read own waitlist entries" ON waitlist_entries;
CREATE POLICY "Customers can read own waitlist entries"
  ON waitlist_entries FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can delete own waitlist entries" ON waitlist_entries;
CREATE POLICY "Customers can delete own waitlist entries"
  ON waitlist_entries FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());
