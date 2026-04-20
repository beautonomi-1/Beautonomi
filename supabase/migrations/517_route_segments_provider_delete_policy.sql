-- Allow providers to delete route segments for their own routes (needed to re-run route optimization).

DROP POLICY IF EXISTS "Providers can delete own route segments" ON route_segments;
CREATE POLICY "Providers can delete own route segments"
  ON route_segments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM travel_routes
      JOIN providers ON providers.id = travel_routes.provider_id
      WHERE travel_routes.id = route_segments.route_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Superadmins can delete route segments" ON route_segments;
CREATE POLICY "Superadmins can delete route segments"
  ON route_segments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );
