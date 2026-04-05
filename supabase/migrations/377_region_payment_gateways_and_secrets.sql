-- Region-scoped payment gateway config and secrets (spec §4.1, §7).
-- Mirrors the schema outlined in docs/GLOBAL_EXPANSION_GUIDE.md.

CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  default_currency TEXT NOT NULL DEFAULT 'ZAR',
  default_language TEXT NOT NULL DEFAULT 'en',
  supported_languages TEXT[] DEFAULT ARRAY['en'],
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_regions_updated_at
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.region_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(region_id)
);

CREATE TRIGGER update_region_settings_updated_at
  BEFORE UPDATE ON public.region_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.region_payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_primary_online BOOLEAN DEFAULT false,
  is_primary_pos BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(region_id, gateway)
);

CREATE TRIGGER update_region_payment_gateways_updated_at
  BEFORE UPDATE ON public.region_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.region_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_encrypted TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(region_id, key)
);

CREATE TRIGGER update_region_secrets_updated_at
  BEFORE UPDATE ON public.region_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed a ZA region and map it to the existing ZA tenant domains as the first region.
DO $$
DECLARE
  v_region_id UUID;
BEGIN
  INSERT INTO public.regions (code, name, domain, default_currency, default_language, timezone)
  VALUES ('ZA', 'South Africa', 'beautonomi.co.za', 'ZAR', 'en', 'Africa/Johannesburg')
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO v_region_id FROM public.regions WHERE code = 'ZA' LIMIT 1;

  IF v_region_id IS NOT NULL THEN
    INSERT INTO public.region_settings (region_id, settings, is_active)
    VALUES (v_region_id, '{}'::jsonb, true)
    ON CONFLICT (region_id) DO NOTHING;
  END IF;
END $$;

