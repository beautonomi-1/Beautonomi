-- Customer-facing job title (nail technician, barber, etc.) separate from permission role.

ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS public_title TEXT;

COMMENT ON COLUMN public.provider_staff.public_title IS
  'Optional subtitle shown on public booking; permission role stays owner/manager/employee.';
