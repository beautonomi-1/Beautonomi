-- Migrate global category icons from .png to .svg.
-- SVG files use the same base name in apps/web/public/images/.

UPDATE public.global_service_categories
SET icon = '/images/makeup.svg', updated_at = now()
WHERE slug = 'makeup' AND icon = '/images/makeup.png';

UPDATE public.global_service_categories
SET icon = '/images/afro-natural-hair.svg', updated_at = now()
WHERE slug = 'natural-hair' AND icon = '/images/afro-natural-hair.png';

UPDATE public.global_service_categories
SET icon = '/images/nail-art.svg', updated_at = now()
WHERE slug = 'nails' AND icon = '/images/nail-art.png';

UPDATE public.global_service_categories
SET icon = '/images/braids.svg', updated_at = now()
WHERE slug = 'braids' AND icon = '/images/braids.png';

UPDATE public.global_service_categories
SET icon = '/images/massage.svg', updated_at = now()
WHERE slug = 'massage' AND icon = '/images/massage.png';

UPDATE public.global_service_categories
SET icon = '/images/dreadlocks.svg', updated_at = now()
WHERE slug = 'dreadlocks' AND icon = '/images/dreadlocks.png';

UPDATE public.global_service_categories
SET icon = '/images/mascara.svg', updated_at = now()
WHERE slug = 'brows-lashes' AND icon = '/images/mascara.png';

UPDATE public.global_service_categories
SET icon = '/images/curling-hair.svg', updated_at = now()
WHERE slug = 'wigs-weaves' AND icon = '/images/curling-hair.png';

UPDATE public.global_service_categories
SET icon = '/images/facial-treatment.svg', updated_at = now()
WHERE slug = 'skin-facials' AND icon = '/images/facial-treatment.png';

UPDATE public.global_service_categories
SET icon = '/images/wax.svg', updated_at = now()
WHERE slug = 'hair-removal' AND icon = '/images/wax.png';

UPDATE public.global_service_categories
SET icon = '/images/facial.svg', updated_at = now()
WHERE slug = 'spa' AND icon = '/images/facial.png';

UPDATE public.global_service_categories
SET icon = '/images/barbershop.svg', updated_at = now()
WHERE slug = 'barber' AND icon = '/images/barbershop.png';
