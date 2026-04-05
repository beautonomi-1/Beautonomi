-- Global category icons: user-provided PNG/SVG assets under apps/web/public/images.
-- PNG paths use URL-safe names (afro-natural-hair.png). Apply migration after renaming
-- "afro natural hair.png" → afro-natural-hair.png in the web public folder if needed.

UPDATE public.global_service_categories
SET icon = '/images/hairstylist_6672954.svg', updated_at = now()
WHERE slug = 'hair';

UPDATE public.global_service_categories
SET icon = '/images/makeup.png', updated_at = now()
WHERE slug = 'makeup';

UPDATE public.global_service_categories
SET icon = '/images/mascara.png', updated_at = now()
WHERE slug = 'brows-lashes';

UPDATE public.global_service_categories
SET icon = '/images/massage.png', updated_at = now()
WHERE slug = 'massage';

UPDATE public.global_service_categories
SET icon = '/images/nail-art.png', updated_at = now()
WHERE slug = 'nails';

UPDATE public.global_service_categories
SET icon = '/images/wax.png', updated_at = now()
WHERE slug = 'hair-removal';

UPDATE public.global_service_categories
SET icon = '/images/facial-treatment.png', updated_at = now()
WHERE slug = 'skin-facials';

UPDATE public.global_service_categories
SET icon = '/images/afro-natural-hair.png', updated_at = now()
WHERE slug = 'natural-hair';

UPDATE public.global_service_categories
SET icon = '/images/dreadlocks.png', updated_at = now()
WHERE slug = 'dreadlocks';

UPDATE public.global_service_categories
SET icon = '/images/braids.png', updated_at = now()
WHERE slug = 'braids';

UPDATE public.global_service_categories
SET icon = '/images/curling-hair.png', updated_at = now()
WHERE slug = 'wigs-weaves';

UPDATE public.global_service_categories
SET icon = '/images/facial.png', updated_at = now()
WHERE slug = 'spa';

UPDATE public.global_service_categories
SET icon = '/images/barbershop.png', updated_at = now()
WHERE slug = 'barber';
