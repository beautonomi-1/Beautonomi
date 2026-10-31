-- Materialize staff_services from legacy offerings.team_member_ids where no rows exist yet.

INSERT INTO public.staff_services (staff_id, offering_id, provider_id)
SELECT DISTINCT unnest(o.team_member_ids)::uuid AS staff_id, o.id AS offering_id, o.provider_id
FROM public.offerings o
WHERE o.team_member_ids IS NOT NULL
  AND cardinality(o.team_member_ids) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_services ss WHERE ss.offering_id = o.id
  )
ON CONFLICT (staff_id, offering_id) DO NOTHING;
