-- Close-out reminder deep link: bookings list honors ?status=close_out
-- (web hub + provider app). Keep filter=close_out working in app routing
-- for already-sent notifications.

UPDATE public.notification_templates
SET
  url = '/provider/bookings?status=close_out',
  updated_at = NOW()
WHERE key = 'provider_closeout_reminder'
  AND url IS DISTINCT FROM '/provider/bookings?status=close_out';
