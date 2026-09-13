-- ZA market language allowlist + emergency contact language (separate from UI language).
-- Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS emergency_contact_language TEXT;

COMMENT ON COLUMN public.users.emergency_contact_language IS
  'Preferred language for emergency contact communications; independent of users.preferred_language (UI).';

-- Home market: expose all Wave A South African languages (not just English).
UPDATE public.regions
SET supported_languages = ARRAY[
  'en', 'af', 'zu', 'xh', 'st', 'nso', 'tn', 'ts', 've', 'ss'
]
WHERE code = 'ZA'
  AND (
    supported_languages IS NULL
    OR supported_languages = '{}'
    OR supported_languages = ARRAY['en']
  );
