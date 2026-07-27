-- Trigram indexes for public search suggestion ILIKE scans.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_services_name_trgm
  ON public.services USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_services_description_trgm
  ON public.services USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_providers_business_name_trgm
  ON public.providers USING gin (business_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_providers_description_trgm
  ON public.providers USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_categories_name_trgm
  ON public.service_categories USING gin (name gin_trgm_ops);

-- The suggestions route runs the same category ILIKE clause against the global table.
CREATE INDEX IF NOT EXISTS idx_global_service_categories_name_trgm
  ON public.global_service_categories USING gin (name gin_trgm_ops);
