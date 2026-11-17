-- Any active staff member of a salon can read report_schedules, including
-- the recipient address list. Drop the table read for anon and authenticated,
-- then grant every other column. INSERT and UPDATE stay, so a schedule can
-- still store that list. The schedule screen keeps the original table read
-- after the reports permission check.

REVOKE SELECT ON TABLE public.report_schedules FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  report_type,
  frequency,
  day_of_week,
  day_of_month,
  time,
  format,
  is_active,
  created_by,
  created_at,
  updated_at,
  last_run_at,
  next_run_at
) ON TABLE public.report_schedules TO anon, authenticated;
