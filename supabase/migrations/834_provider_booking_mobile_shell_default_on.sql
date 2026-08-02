-- Phase 5: Enable provider booking mobile shell by default (legacy AppointmentSidebar removed).

UPDATE public.feature_flags
SET
    enabled = true,
    description = 'Mobile-first booking bottom sheet on provider calendar, bookings, and front desk. Disable only for emergency rollback (requires redeploy with previous release).'
WHERE feature_key = 'provider_booking_mobile_shell'
  AND tenant_id IS NULL;

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'provider_booking_mobile_shell',
    'Provider booking mobile shell',
    'Mobile-first booking bottom sheet on provider calendar, bookings, and front desk. Disable only for emergency rollback (requires redeploy with previous release).',
    true,
    'provider'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'provider_booking_mobile_shell'
      AND tenant_id IS NULL
);
