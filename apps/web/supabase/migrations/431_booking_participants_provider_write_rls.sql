-- 431_booking_participants_provider_write_rls.sql
-- Allow provider owners and active staff to add/remove group booking participants (API uses user JWT).

DROP POLICY IF EXISTS "Providers insert booking participants" ON public.booking_participants;
CREATE POLICY "Providers insert booking participants"
    ON public.booking_participants FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.group_bookings gb
            JOIN public.providers p ON p.id = gb.provider_id
            JOIN public.bookings b ON b.id = booking_participants.booking_id
            WHERE gb.id = booking_participants.group_booking_id
              AND b.provider_id = p.id
              AND (
                  p.user_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.provider_staff ps
                      WHERE ps.provider_id = p.id
                        AND ps.user_id = auth.uid()
                        AND ps.is_active = true
                  )
              )
        )
    );

DROP POLICY IF EXISTS "Providers delete booking participants" ON public.booking_participants;
CREATE POLICY "Providers delete booking participants"
    ON public.booking_participants FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.group_bookings gb
            JOIN public.providers p ON p.id = gb.provider_id
            WHERE gb.id = booking_participants.group_booking_id
              AND (
                  p.user_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.provider_staff ps
                      WHERE ps.provider_id = p.id
                        AND ps.user_id = auth.uid()
                        AND ps.is_active = true
                  )
              )
        )
    );
