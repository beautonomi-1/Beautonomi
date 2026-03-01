-- Allow providers to INSERT and UPDATE route_segments for their own routes
-- (GET/POST /api/provider/routes and optimize use user's Supabase client with RLS)

DROP POLICY IF EXISTS "Providers can insert own route segments" ON route_segments;
CREATE POLICY "Providers can insert own route segments"
    ON route_segments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM travel_routes
            JOIN providers ON providers.id = travel_routes.provider_id
            WHERE travel_routes.id = route_segments.route_id
            AND (
                providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Providers can update own route segments" ON route_segments;
CREATE POLICY "Providers can update own route segments"
    ON route_segments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM travel_routes
            JOIN providers ON providers.id = travel_routes.provider_id
            WHERE travel_routes.id = route_segments.route_id
            AND (
                providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can insert route segments" ON route_segments;
CREATE POLICY "Superadmins can insert route segments"
    ON route_segments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

DROP POLICY IF EXISTS "Superadmins can update route segments" ON route_segments;
CREATE POLICY "Superadmins can update route segments"
    ON route_segments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
