-- Provider booking mobile shell (bottom-sheet UX on web calendar/bookings/front-desk).
-- Disabled by default — enable via admin feature_flags for staged rollout.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'provider_booking_mobile_shell',
    'Provider booking mobile shell',
    'Replace the legacy appointment sidebar with the mobile-first booking bottom sheet on provider calendar, bookings, and front desk. Instant rollback by disabling this flag.',
    false,
    'provider'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'provider_booking_mobile_shell'
      AND tenant_id IS NULL
);
