-- Allow Trust & Safety hub reports in user_reports (in addition to booking-context reports).

ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_report_type_check;

ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_report_type_check
  CHECK (report_type IN (
    'customer_reported_provider',
    'provider_reported_customer',
    'safety_report_user'
  ));

COMMENT ON TABLE public.user_reports IS
  'User misconduct reports: booking-context (customer↔provider) and safety-hub user reports. Resolved by trust admins.';
