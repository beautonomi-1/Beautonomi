-- 056_preference_options.sql
-- Create tables for managing preference options (languages, currencies, timezones)

-- Preference options table (unified table for languages, currencies, and timezones)
CREATE TABLE IF NOT EXISTS public.preference_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('language', 'currency', 'timezone')),
  code TEXT, -- ISO code for languages/currencies, or identifier for timezones
  name TEXT NOT NULL, -- Display name
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB, -- Additional data (e.g., currency symbol, timezone offset)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(type, code),
  UNIQUE(type, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_preference_options_type ON public.preference_options(type);
CREATE INDEX IF NOT EXISTS idx_preference_options_active ON public.preference_options(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_preference_options_type_active ON public.preference_options(type, is_active, display_order);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_preference_options_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_preference_options_updated_at') THEN
    DROP TRIGGER set_public_preference_options_updated_at ON public.preference_options;
  END IF;
END $$;

-- Create trigger
CREATE TRIGGER set_public_preference_options_updated_at
  BEFORE UPDATE ON public.preference_options
  FOR EACH ROW
  EXECUTE FUNCTION public.update_preference_options_updated_at();

-- Enable RLS
ALTER TABLE public.preference_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can view active preference options"
  ON public.preference_options FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmins can manage preference options"
  ON public.preference_options FOR ALL
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

-- Insert default languages
INSERT INTO public.preference_options (type, code, name, display_order, is_active) VALUES
  ('language', 'en', 'English', 1, true),
  ('language', 'es', 'Spanish', 2, true),
  ('language', 'fr', 'French', 3, true),
  ('language', 'de', 'German', 4, true),
  ('language', 'it', 'Italian', 5, true),
  ('language', 'pt', 'Portuguese', 6, true),
  ('language', 'zh-CN', 'Chinese (Simplified)', 7, true),
  ('language', 'zh-TW', 'Chinese (Traditional)', 8, true),
  ('language', 'ja', 'Japanese', 9, true),
  ('language', 'ko', 'Korean', 10, true),
  ('language', 'ar', 'Arabic', 11, true),
  ('language', 'hi', 'Hindi', 12, true),
  ('language', 'ru', 'Russian', 13, true),
  ('language', 'nl', 'Dutch', 14, true),
  ('language', 'sv', 'Swedish', 15, true),
  ('language', 'no', 'Norwegian', 16, true),
  ('language', 'da', 'Danish', 17, true),
  ('language', 'fi', 'Finnish', 18, true),
  ('language', 'pl', 'Polish', 19, true),
  ('language', 'tr', 'Turkish', 20, true)
ON CONFLICT (type, code) DO NOTHING;

-- Insert default currencies
INSERT INTO public.preference_options (type, code, name, display_order, is_active, metadata) VALUES
  ('currency', 'USD', 'United States dollar', 1, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'EUR', 'Euro', 2, true, '{"symbol": "€"}'::jsonb),
  ('currency', 'GBP', 'British Pound', 3, true, '{"symbol": "£"}'::jsonb),
  ('currency', 'JPY', 'Japanese Yen', 4, true, '{"symbol": "¥"}'::jsonb),
  ('currency', 'CAD', 'Canadian Dollar', 5, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'AUD', 'Australian Dollar', 6, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'CHF', 'Swiss Franc', 7, true, '{"symbol": "CHF"}'::jsonb),
  ('currency', 'CNY', 'Chinese Yuan', 8, true, '{"symbol": "¥"}'::jsonb),
  ('currency', 'INR', 'Indian Rupee', 9, true, '{"symbol": "₹"}'::jsonb),
  ('currency', 'ZAR', 'South African Rand', 10, true, '{"symbol": "R"}'::jsonb),
  ('currency', 'BRL', 'Brazilian Real', 11, true, '{"symbol": "R$"}'::jsonb),
  ('currency', 'MXN', 'Mexican Peso', 12, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'SGD', 'Singapore Dollar', 13, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'HKD', 'Hong Kong Dollar', 14, true, '{"symbol": "$"}'::jsonb),
  ('currency', 'NZD', 'New Zealand Dollar', 15, true, '{"symbol": "$"}'::jsonb)
ON CONFLICT (type, code) DO NOTHING;

-- Insert default timezones
INSERT INTO public.preference_options (type, code, name, display_order, is_active) VALUES
  ('timezone', 'GMT-11', '(GMT-11:00) Midway Island', 1, true),
  ('timezone', 'GMT-10', '(GMT-10:00) Hawaii', 2, true),
  ('timezone', 'GMT-9', '(GMT-09:00) Alaska', 3, true),
  ('timezone', 'GMT-8', '(GMT-08:00) Pacific Time (US & Canada)', 4, true),
  ('timezone', 'GMT-7', '(GMT-07:00) Mountain Time (US & Canada)', 5, true),
  ('timezone', 'GMT-6', '(GMT-06:00) Central Time (US & Canada)', 6, true),
  ('timezone', 'GMT-5', '(GMT-05:00) Eastern Time (US & Canada)', 7, true),
  ('timezone', 'GMT-4', '(GMT-04:00) Atlantic Time (Canada)', 8, true),
  ('timezone', 'GMT-3', '(GMT-03:00) Buenos Aires', 9, true),
  ('timezone', 'GMT-2', '(GMT-02:00) Mid-Atlantic', 10, true),
  ('timezone', 'GMT-1', '(GMT-01:00) Azores', 11, true),
  ('timezone', 'GMT+0', '(GMT+00:00) Greenwich Mean Time', 12, true),
  ('timezone', 'GMT+1', '(GMT+01:00) Central European Time', 13, true),
  ('timezone', 'GMT+2', '(GMT+02:00) Eastern European Time', 14, true),
  ('timezone', 'GMT+3', '(GMT+03:00) Moscow', 15, true),
  ('timezone', 'GMT+4', '(GMT+04:00) Dubai', 16, true),
  ('timezone', 'GMT+5', '(GMT+05:00) Islamabad', 17, true),
  ('timezone', 'GMT+5.5', '(GMT+05:30) Mumbai', 18, true),
  ('timezone', 'GMT+6', '(GMT+06:00) Dhaka', 19, true),
  ('timezone', 'GMT+7', '(GMT+07:00) Bangkok', 20, true),
  ('timezone', 'GMT+8', '(GMT+08:00) Beijing', 21, true),
  ('timezone', 'GMT+9', '(GMT+09:00) Tokyo', 22, true),
  ('timezone', 'GMT+10', '(GMT+10:00) Sydney', 23, true),
  ('timezone', 'GMT+11', '(GMT+11:00) Solomon Islands', 24, true),
  ('timezone', 'GMT+12', '(GMT+12:00) Auckland', 25, true)
ON CONFLICT (type, code) DO NOTHING;

-- Comments
COMMENT ON TABLE public.preference_options IS 'Manageable preference options (languages, currencies, timezones) for global preferences';
COMMENT ON COLUMN public.preference_options.type IS 'Type of option: language, currency, or timezone';
COMMENT ON COLUMN public.preference_options.code IS 'ISO code or identifier (e.g., en, USD, GMT-5)';
COMMENT ON COLUMN public.preference_options.name IS 'Display name shown to users';
COMMENT ON COLUMN public.preference_options.metadata IS 'Additional data (e.g., currency symbol, timezone offset)';
