-- Assign correctly-matched image-based icons to each remaining category.
-- Icons sourced from:
--   - Tabler Icons (MIT): massage
--   - MDI / Material Design Icons Community (Apache 2.0): nail, spa, scissors-cutting
--   - Custom stroke SVGs (Beautonomi, MIT): braids, dreadlocks, natural-hair, wigs-weaves
-- All icons are 24×24 SVGs tinted via CSS filter in GlobalCategoryIcon.tsx.

-- Tabler "massage" icon — person lying on a massage table (Health category)
UPDATE public.global_service_categories
SET icon = '/images/icons8-massage-64.svg', updated_at = now()
WHERE slug = 'massage';

-- MDI "spa" icon — lotus/spa flower (recognisable spa symbol)
UPDATE public.global_service_categories
SET icon = '/images/icons8-spa-64.svg', updated_at = now()
WHERE slug = 'spa';

-- Custom "natural hair (afro)" icon — large round afro dome silhouette
UPDATE public.global_service_categories
SET icon = '/images/icons8-natural-hair-64.svg', updated_at = now()
WHERE slug = 'natural-hair';

-- MDI "scissors-cutting" icon — scissors with cutting motion (barber/grooming)
UPDATE public.global_service_categories
SET icon = '/images/icons8-barber-64.svg', updated_at = now()
WHERE slug = 'barber';

-- Custom "braids" icon — 3 wavy S-curve strands with braid cross-over connectors
UPDATE public.global_service_categories
SET icon = '/images/icons8-braids-64.svg', updated_at = now()
WHERE slug = 'braids';

-- Custom "wigs & weaves" icon — wig cap dome with flowing long strands
UPDATE public.global_service_categories
SET icon = '/images/icons8-wigs-weaves-64.svg', updated_at = now()
WHERE slug = 'wigs-weaves';

-- Custom "dreadlocks" icon — head circle with 5 rope-like loc strands hanging down
UPDATE public.global_service_categories
SET icon = '/images/icons8-dreadlocks-64.svg', updated_at = now()
WHERE slug = 'dreadlocks';

-- MDI "nail" icon — nail file shape (manicure/nails)
UPDATE public.global_service_categories
SET icon = '/images/icons8-nails-64.svg', updated_at = now()
WHERE slug = 'nails';
