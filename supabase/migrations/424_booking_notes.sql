-- 424_booking_notes.sql
-- Internal/provider notes per booking (threaded-style CRUD via API)

CREATE TABLE IF NOT EXISTS public.booking_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name TEXT,
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_notes_booking_created
    ON public.booking_notes(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_notes_provider
    ON public.booking_notes(provider_id);

DROP TRIGGER IF EXISTS update_booking_notes_updated_at ON public.booking_notes;
CREATE TRIGGER update_booking_notes_updated_at
    BEFORE UPDATE ON public.booking_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage booking notes for own bookings" ON public.booking_notes;
CREATE POLICY "Providers manage booking notes for own bookings"
    ON public.booking_notes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_notes.booking_id
              AND b.provider_id = booking_notes.provider_id
              AND EXISTS (
                  SELECT 1 FROM public.providers p
                  WHERE p.id = b.provider_id
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
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_notes.booking_id
              AND b.provider_id = booking_notes.provider_id
              AND EXISTS (
                  SELECT 1 FROM public.providers p
                  WHERE p.id = b.provider_id
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
        )
    );

COMMENT ON TABLE public.booking_notes IS 'Provider-facing notes attached to bookings';
