-- Default weekly working_hours for staff with none configured, so availability never
-- returns zero shifts solely because working_hours was {} or NULL.
-- Matches runtime defaults in apps/web/src/lib/availability/load-constraints.ts:
-- Mon–Fri 09:00–18:00, Sat–Sun closed.

UPDATE public.provider_staff
SET working_hours = jsonb_build_object(
  'monday', jsonb_build_object('is_open', true, 'open_time', '09:00', 'close_time', '18:00'),
  'tuesday', jsonb_build_object('is_open', true, 'open_time', '09:00', 'close_time', '18:00'),
  'wednesday', jsonb_build_object('is_open', true, 'open_time', '09:00', 'close_time', '18:00'),
  'thursday', jsonb_build_object('is_open', true, 'open_time', '09:00', 'close_time', '18:00'),
  'friday', jsonb_build_object('is_open', true, 'open_time', '09:00', 'close_time', '18:00'),
  'saturday', jsonb_build_object('is_open', false),
  'sunday', jsonb_build_object('is_open', false)
)
WHERE working_hours IS NULL
   OR working_hours = '{}'::jsonb;
