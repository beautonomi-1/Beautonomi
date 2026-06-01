-- Membership win-back deep link.
--
-- Previously the membership_win_back template had a static url of '/membership',
-- which the customer app couldn't route anywhere meaningful, so tapping the
-- notification did nothing. The notification service now builds a `plans_url`
-- variable that deep links straight to the inviting provider's profile on the
-- Memberships tab (e.g. /partner-profile?slug=<slug>&tab=memberships). Point the
-- template url at that variable so the push deep link and email CTA both land on
-- the provider's membership plans.
UPDATE public.notification_templates
SET url = '{{plans_url}}',
    updated_at = NOW()
WHERE key = 'membership_win_back';
