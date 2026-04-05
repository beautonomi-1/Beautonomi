-- 426_calendar_links.sql
-- Shareable read-only calendar links (filters in settings JSON)

CREATE TABLE IF NOT EXISTS public.calendar_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_calendar_links_provider ON public.calendar_links(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_links_slug_active ON public.calendar_links(slug) WHERE is_active = true;

DROP TRIGGER IF EXISTS update_calendar_links_updated_at ON public.calendar_links;
CREATE TRIGGER update_calendar_links_updated_at
    BEFORE UPDATE ON public.calendar_links
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calendar_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own calendar links" ON public.calendar_links;
CREATE POLICY "Providers manage own calendar links"
    ON public.calendar_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = calendar_links.provider_id
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

COMMENT ON TABLE public.calendar_links IS 'Public/shareable calendar feed configuration per provider';
