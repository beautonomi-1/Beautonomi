-- 428_waitlist_entries_location_id.sql

ALTER TABLE public.waitlist_entries
    ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_location
    ON public.waitlist_entries(provider_id, location_id);

-- Backfill from first offering location when service is scoped to branches
UPDATE public.waitlist_entries w
SET location_id = sub.loc_id
FROM (
    SELECT w2.id AS entry_id,
           (
               SELECT ol.location_id
               FROM public.offering_locations ol
               WHERE ol.offering_id = w2.service_id
               ORDER BY ol.location_id
               LIMIT 1
           ) AS loc_id
    FROM public.waitlist_entries w2
    WHERE w2.location_id IS NULL
      AND w2.service_id IS NOT NULL
) sub
WHERE w.id = sub.entry_id
  AND sub.loc_id IS NOT NULL;
