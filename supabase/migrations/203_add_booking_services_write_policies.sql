-- Add UPDATE, INSERT, DELETE RLS policies for booking_services
-- Previously only SELECT was allowed; providers need to modify staff, services, etc.

-- INSERT: Providers (owner + staff) and superadmins can create booking services for their bookings
CREATE POLICY "Providers and superadmins can create booking services"
    ON booking_services FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_services.booking_id
            AND (
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
                OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

-- UPDATE: Providers (owner + staff) and superadmins can update booking services for their bookings
CREATE POLICY "Providers and superadmins can update booking services"
    ON booking_services FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_services.booking_id
            AND (
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
                OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );

-- DELETE: Providers (owner + staff) and superadmins can delete booking services for their bookings
CREATE POLICY "Providers and superadmins can delete booking services"
    ON booking_services FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_services.booking_id
            AND (
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = bookings.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
                OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = 'superadmin'
                )
            )
        )
    );
