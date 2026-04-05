-- Align portal weekly schedule (staff_schedules) with default business hours for staff
-- who have no rows yet, so /api/provider/staff/[id]/shifts matches public availability
-- (see resolveStaffScheduleForDate in load-constraints.ts).
-- Mon–Fri 09:00–18:00; no Sat/Sun rows (GET treats missing days as not working).

INSERT INTO public.staff_schedules (
  staff_id,
  provider_id,
  day_of_week,
  start_time,
  end_time,
  is_working
)
SELECT
  ps.id,
  ps.provider_id,
  v.dow,
  '09:00'::time,
  '18:00'::time,
  true
FROM public.provider_staff ps
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS v(dow)
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_schedules ss WHERE ss.staff_id = ps.id
);
