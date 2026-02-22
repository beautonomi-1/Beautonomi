-- ISO Codes Management Tables
-- Creates tables for managing ISO 4217 currencies, ISO 639-1 languages, ISO 3166-1 countries,
-- locales (ISO 639-1 + ISO 3166-1), and IANA timezones

-- ISO 4217 Currency Codes
CREATE TABLE IF NOT EXISTS public.iso_currencies (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 3 AND code ~ '^[A-Z]{3}$'),
  name TEXT NOT NULL,
  symbol TEXT,
  decimal_places INTEGER NOT NULL DEFAULT 2 CHECK (decimal_places >= 0 AND decimal_places <= 4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ISO 639-1 Language Codes
CREATE TABLE IF NOT EXISTS public.iso_languages (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 2 AND code ~ '^[a-z]{2}$'),
  name TEXT NOT NULL,
  native_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  rtl BOOLEAN NOT NULL DEFAULT false, -- Right-to-left
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ISO 3166-1 Country Codes with ITU-T E.164 Phone Codes
CREATE TABLE IF NOT EXISTS public.iso_countries (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 2 AND code ~ '^[A-Z]{2}$'),
  code3 TEXT CHECK (code3 IS NULL OR (char_length(code3) = 3 AND code3 ~ '^[A-Z]{3}$')),
  numeric_code TEXT CHECK (numeric_code IS NULL OR (char_length(numeric_code) = 3 AND numeric_code ~ '^[0-9]{3}$')),
  name TEXT NOT NULL,
  phone_country_code TEXT NOT NULL CHECK (phone_country_code ~ '^\+\d{1,4}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ISO 639-1 + ISO 3166-1 Locale Codes (e.g., en-US, en-ZA)
CREATE TABLE IF NOT EXISTS public.iso_locales (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z]{2}-[A-Z]{2}$'),
  language_code TEXT NOT NULL REFERENCES public.iso_languages(code) ON DELETE RESTRICT,
  country_code TEXT NOT NULL REFERENCES public.iso_countries(code) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IANA Timezone Codes
CREATE TABLE IF NOT EXISTS public.iso_timezones (
  code TEXT PRIMARY KEY, -- IANA timezone identifier (e.g., Africa/Johannesburg)
  name TEXT NOT NULL,
  utc_offset TEXT NOT NULL CHECK (utc_offset ~ '^[+-]\d{2}:\d{2}$'),
  country_code TEXT REFERENCES public.iso_countries(code) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_iso_currencies_active ON public.iso_currencies(is_active);
CREATE INDEX IF NOT EXISTS idx_iso_currencies_default ON public.iso_currencies(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_iso_languages_active ON public.iso_languages(is_active);
CREATE INDEX IF NOT EXISTS idx_iso_languages_default ON public.iso_languages(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_iso_countries_active ON public.iso_countries(is_active);
CREATE INDEX IF NOT EXISTS idx_iso_countries_default ON public.iso_countries(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_iso_locales_language ON public.iso_locales(language_code);
CREATE INDEX IF NOT EXISTS idx_iso_locales_country ON public.iso_locales(country_code);
CREATE INDEX IF NOT EXISTS idx_iso_locales_active ON public.iso_locales(is_active);
CREATE INDEX IF NOT EXISTS idx_iso_locales_default ON public.iso_locales(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_iso_timezones_country ON public.iso_timezones(country_code);
CREATE INDEX IF NOT EXISTS idx_iso_timezones_active ON public.iso_timezones(is_active);
CREATE INDEX IF NOT EXISTS idx_iso_timezones_default ON public.iso_timezones(is_default) WHERE is_default = true;

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_iso_currencies_updated_at
  BEFORE UPDATE ON public.iso_currencies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iso_languages_updated_at
  BEFORE UPDATE ON public.iso_languages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iso_countries_updated_at
  BEFORE UPDATE ON public.iso_countries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iso_locales_updated_at
  BEFORE UPDATE ON public.iso_locales
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iso_timezones_updated_at
  BEFORE UPDATE ON public.iso_timezones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.iso_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_timezones ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only superadmins can manage ISO codes
-- Using the same pattern as preference_options (checking users table role)

-- Currencies
CREATE POLICY "Superadmins can manage currencies"
  ON public.iso_currencies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Languages
CREATE POLICY "Superadmins can manage languages"
  ON public.iso_languages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Countries
CREATE POLICY "Superadmins can manage countries"
  ON public.iso_countries FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Locales
CREATE POLICY "Superadmins can manage locales"
  ON public.iso_locales FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Timezones
CREATE POLICY "Superadmins can manage timezones"
  ON public.iso_timezones FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );
