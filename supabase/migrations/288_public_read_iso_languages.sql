-- Allow public read of active languages for i18n / language selector (same pattern as iso_countries)
CREATE POLICY "Public can read active languages"
  ON public.iso_languages FOR SELECT
  TO public
  USING (is_active = true);
