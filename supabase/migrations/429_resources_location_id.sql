-- 429_resources_location_id.sql

ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resources_provider_location
    ON public.resources(provider_id, location_id);
