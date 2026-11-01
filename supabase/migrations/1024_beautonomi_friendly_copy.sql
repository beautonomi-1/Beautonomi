-- Replace seeded Airbnb-style beautonomi-friendly CMS copy with factual beauty-marketplace copy.
-- Only updates rows that still match migration 597 defaults (admin edits are preserved).

UPDATE public.page_content
SET content = 'Find beauty services' || chr(10) || 'on Beautonomi'
WHERE page_slug = 'beautonomi-friendly'
  AND section_key = 'hero_title'
  AND content = 'Introducing' || chr(10) || 'Beautonomi-friendly' || chr(10) || 'apartments';

UPDATE public.page_content
SET content = 'Discover salons and freelancers near you. Search, view a profile, and book online.'
WHERE page_slug = 'beautonomi-friendly'
  AND section_key = 'hero_subtitle'
  AND content = 'Rent a place to live. Beautonomi it part-time.';

UPDATE public.page_content
SET content = 'Find a provider'
WHERE page_slug = 'beautonomi-friendly'
  AND section_key = 'cta_label'
  AND content = 'Explore near you';

UPDATE public.page_content
SET content = '/search'
WHERE page_slug = 'beautonomi-friendly'
  AND section_key = 'cta_href'
  AND content = '/explore';
