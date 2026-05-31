-- Allow notification_logs.status = 'suppressed' so we can record pushes that
-- were intentionally NOT sent (customer notification preferences opt-out or
-- quiet hours) as distinct from delivery failures or successful sends.
--
-- §Push-audit 2026-05: template-event pushes were being dropped silently while
-- the super-admin broadcast (which skips preference/quiet-hours gating) still
-- delivered. The send path now logs suppression explicitly; this widens the
-- CHECK constraint so those rows can be inserted.

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_status_check;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_status_check
    CHECK (status IN ('sent', 'failed', 'pending', 'suppressed'));
