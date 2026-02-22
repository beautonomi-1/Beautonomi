-- Add public read access to iso_countries for dropdowns and forms
-- This allows unauthenticated users to read country data for address forms

CREATE POLICY "Public can read active countries"
  ON public.iso_countries FOR SELECT
  TO public
  USING (is_active = true);
