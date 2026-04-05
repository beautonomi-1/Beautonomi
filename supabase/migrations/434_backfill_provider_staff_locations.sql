-- Link existing active staff to all active locations for their provider when junction rows are missing.
-- Fixes calendar / team pickers that filter by location_id via provider_staff_locations.

INSERT INTO public.provider_staff_locations (staff_id, location_id, is_primary)
SELECT ps.id,
       pl.id,
       false
FROM public.provider_staff ps
INNER JOIN public.provider_locations pl
  ON pl.provider_id = ps.provider_id
 AND COALESCE(pl.is_active, true)
WHERE COALESCE(ps.is_active, true)
  AND NOT EXISTS (
    SELECT 1
    FROM public.provider_staff_locations psl
    WHERE psl.staff_id = ps.id
      AND psl.location_id = pl.id
  )
ON CONFLICT (staff_id, location_id) DO NOTHING;

-- One primary location per staff (partial unique index) when none set yet
WITH candidates AS (
  SELECT psl.id,
         ROW_NUMBER() OVER (
           PARTITION BY psl.staff_id
           ORDER BY pl.is_primary DESC NULLS LAST,
                    pl.created_at ASC NULLS LAST,
                    pl.id
         ) AS rn
  FROM public.provider_staff_locations psl
  INNER JOIN public.provider_locations pl ON pl.id = psl.location_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.provider_staff_locations x
    WHERE x.staff_id = psl.staff_id
      AND x.is_primary = true
  )
)
UPDATE public.provider_staff_locations psl
SET is_primary = true
FROM candidates c
WHERE psl.id = c.id
  AND c.rn = 1;
