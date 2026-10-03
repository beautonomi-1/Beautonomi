-- Trigram indexes for public search suggestion ILIKE scans.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path = public, extensions;

CREATE INDEX IF NOT EXISTS idx_offerings_title_trgm
  ON public.offerings USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_offerings_description_trgm
  ON public.offerings USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_providers_business_name_trgm
  ON public.providers USING gin (business_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_providers_description_trgm
  ON public.providers USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

-- The suggestions route runs the same category ILIKE clause against the global table.
CREATE INDEX IF NOT EXISTS idx_global_service_categories_name_trgm
  ON public.global_service_categories USING gin (name gin_trgm_ops);
