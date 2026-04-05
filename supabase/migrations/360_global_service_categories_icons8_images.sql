-- Use high-quality icons8 image assets for categories where they exist.
-- Categories without icons8 images keep their Beautonomi bespoke SVG keys.
-- Image paths are served from /public/images in the web app (Next.js static assets).

UPDATE public.global_service_categories
SET icon = '/images/icons8-hair-dryer-80.svg', updated_at = now()
WHERE slug = 'hair';

UPDATE public.global_service_categories
SET icon = '/images/icons8-makeup-64.svg', updated_at = now()
WHERE slug = 'makeup';

UPDATE public.global_service_categories
SET icon = '/images/icons8-eyebrow-64.svg', updated_at = now()
WHERE slug = 'brows-lashes';

UPDATE public.global_service_categories
SET icon = '/images/icons8-skin-facials-64.svg', updated_at = now()
WHERE slug = 'skin-facials';

UPDATE public.global_service_categories
SET icon = '/images/icons8-waxing-64.svg', updated_at = now()
WHERE slug = 'hair-removal';
