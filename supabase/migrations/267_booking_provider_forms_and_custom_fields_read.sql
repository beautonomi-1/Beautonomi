-- Add provider form responses to bookings (for provider_forms intake/consent/waiver)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS provider_form_responses JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN bookings.provider_form_responses IS 'JSON map: form_id -> { field_id or field name -> value }. Filled by customer at booking/checkout from provider_forms.';

-- Allow authenticated users to read active custom_fields (for booking/profile/user/provider forms)
-- Replace policy from 245 so definitions load in booking/checkout and profile forms
DROP POLICY IF EXISTS "Authenticated users can view active custom fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Authenticated users can read active custom fields" ON public.custom_fields;
CREATE POLICY "Authenticated users can read active custom fields"
  ON public.custom_fields
  FOR SELECT
  USING (
    is_active = true
    AND auth.role() = 'authenticated'
  );
