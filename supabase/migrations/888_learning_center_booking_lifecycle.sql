-- Learning Center: booking lifecycle (confirmation SLA, running late, close-out)

UPDATE public.learning_articles
SET
  summary = 'Reschedule, cancel, verify arrival, tell the salon you are running late, pay additional charges, and write reviews from your booking.',
  body = $body$
<p>Open any upcoming or past booking from the Bookings tab to see its detail. From there you can reschedule (request a new date or time), cancel (subject to cancellation policy), or pay any outstanding amount.</p>
<p>If you are running late, use <strong>I'm running late</strong> from about 30 minutes before your slot until the appointment window ends. The salon is notified with your ETA and can acknowledge so you know they will wait. Your booking stays in Upcoming through that late window — it does not jump to Past at the start time.</p>
<p>After the visit, the salon closes the appointment out (complete, no-show, or cancel). Until they do, you may see <strong>Waiting for salon to close out</strong> on past bookings. If a no-show fee was applied by mistake, open the booking and submit a ticket under <strong>I was marked as a no-show but I attended</strong>.</p>
<p>Online requests that need confirmation show when the salon will reply. If they do not confirm in time, the slot is released automatically, you are not charged (or you are refunded in full), and you can tap <strong>Book again</strong> with the same provider.</p>
$body$,
  updated_at = NOW()
WHERE slug = 'managing-bookings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'Set availability, time blocks, days off, recurring appointments, and close out leftover visits.',
  body = $body$
<p>Your calendar drives when customers can book. Set availability by day and time, assign it to locations and staff, and use time blocks or days off for lunch, events, and leave.</p>
<p>Recurring appointments are confirmed when the series is accepted — each upcoming instance is already confirmed, so you do not re-approve every visit.</p>
<p>When a confirmed appointment ends, it stays open until you close it out. Use the <strong>Needs close-out</strong> queue on Bookings, Waiting room, and the end-of-day report. Mark completed, no-show (with your fee policy), or cancel. There is no automatic no-show or auto-cancel for confirmed visits.</p>
<p>If you are running behind, use <strong>Running behind</strong> on today's day view to notify remaining confirmed clients in one tap. For house calls, update ETA while en route so the client sees the new arrival time.</p>
$body$,
  updated_at = NOW()
WHERE slug = 'calendar-scheduling-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'Booking links, confirmation SLA for online requests, and embed options.',
  body = $body$
<p>Your booking link lets customers book you directly without searching the app. Share it on social media, your website, or in messages. Where supported, embed a booking widget so customers can choose a time and pay without leaving your page.</p>
<p>Requests customers make online may wait for your confirmation (this is the default). The customer sees when you will confirm — typically within your working hours, and always before the slot. If you do not confirm in time, Beautonomi releases the time and refunds the customer. Bookings you add yourself (phone or walk-in) are confirmed immediately.</p>
<p>You get a reminder 30 minutes after a new request, and again shortly before it expires. Confirm or decline from the notification or the To review list.</p>
$body$,
  updated_at = NOW()
WHERE slug = 'online-booking-links-overview' AND tenant_id IS NULL;
