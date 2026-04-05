-- 430_recurring_appointments_location_id.sql

ALTER TABLE public.recurring_appointments
    ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_appointments_location
    ON public.recurring_appointments(provider_id, location_id);

-- Default to provider's first location when unset
UPDATE public.recurring_appointments ra
SET location_id = sub.first_loc
FROM (
    SELECT ra2.id AS rid,
           (
               SELECT pl.id
               FROM public.provider_locations pl
               WHERE pl.provider_id = ra2.provider_id
               ORDER BY pl.created_at NULLS LAST, pl.id
               LIMIT 1
           ) AS first_loc
    FROM public.recurring_appointments ra2
    WHERE ra2.location_id IS NULL
) sub
WHERE ra.id = sub.rid
  AND sub.first_loc IS NOT NULL;
