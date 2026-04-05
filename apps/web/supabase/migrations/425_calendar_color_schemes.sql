-- 425_calendar_color_schemes.sql

CREATE TABLE IF NOT EXISTS public.calendar_color_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#FF0077',
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_color_schemes_provider
    ON public.calendar_color_schemes(provider_id);

DROP TRIGGER IF EXISTS update_calendar_color_schemes_updated_at ON public.calendar_color_schemes;
CREATE TRIGGER update_calendar_color_schemes_updated_at
    BEFORE UPDATE ON public.calendar_color_schemes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calendar_color_schemes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own calendar color schemes" ON public.calendar_color_schemes;
CREATE POLICY "Providers manage own calendar color schemes"
    ON public.calendar_color_schemes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = calendar_color_schemes.provider_id
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

COMMENT ON TABLE public.calendar_color_schemes IS 'Named color presets for provider calendar UI';
