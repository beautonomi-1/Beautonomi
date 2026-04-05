-- 427_reschedule_requests.sql

CREATE TABLE IF NOT EXISTS public.reschedule_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    original_start TIMESTAMPTZ NOT NULL,
    original_end TIMESTAMPTZ NOT NULL,
    new_start TIMESTAMPTZ NOT NULL,
    new_end TIMESTAMPTZ NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    responded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_provider_status
    ON public.reschedule_requests(provider_id, status);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_booking
    ON public.reschedule_requests(booking_id);

DROP TRIGGER IF EXISTS update_reschedule_requests_updated_at ON public.reschedule_requests;
CREATE TRIGGER update_reschedule_requests_updated_at
    BEFORE UPDATE ON public.reschedule_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage reschedule requests" ON public.reschedule_requests;
CREATE POLICY "Providers manage reschedule requests"
    ON public.reschedule_requests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = reschedule_requests.provider_id
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

COMMENT ON TABLE public.reschedule_requests IS 'Approval workflow for proposed booking time changes';
