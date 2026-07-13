-- Align Learning Center and provider cancellation notification copy with wallet-only refund policy.

UPDATE public.learning_articles
SET
  summary = 'Cancel from booking detail; refunds are credited to your Beautonomi wallet.',
  body = $body$<p>Open the booking from <strong>Bookings</strong> and choose <strong>Cancel</strong>. Refund eligibility depends on how early you cancel and the provider cancellation policy shown at booking.</p>
<h2>What you receive</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel from booking detail — policy applies"></div>
<ol>
  <li>Confirm the estimated cancellation fee and wallet refund shown before you cancel.</li>
  <li>Eligible refunds are issued as <strong>store credit to your Beautonomi wallet</strong>, limited to amounts you have already paid.</li>
  <li>Refunds are not returned to your original card or payment method.</li>
</ol>
<p>Contact support from Profile if cancel fails or you believe a refund is overdue.</p>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'canceling-your-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'Full wallet refund when your provider cancels.',
  body = $body$<p>If a provider cancels, you are notified and receive a <strong>full refund to your Beautonomi wallet</strong> for amounts already paid. No action is required to receive the refund.</p>
<h2>What to do next</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Rebook from Bookings or find a new provider"></div>
<ul>
  <li>Check your wallet balance in Profile.</li>
  <li>Rebook the same provider or find another from Search.</li>
  <li>Contact support if you expected a refund but do not see wallet credit.</li>
</ul>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'if-provider-cancels' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'How wallet refunds and fees apply when you or a provider cancels.',
  body = $body$<p>Refund amount depends on when you cancel and the provider cancellation policy shown at booking.</p>
<h2>Customer cancel</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel from booking detail — policy applies"></div>
<ul>
  <li><strong>Early cancel:</strong> full refund to your Beautonomi wallet (within the free-cancellation window).</li>
  <li><strong>Late cancel:</strong> partial or no wallet refund per policy; any fee is capped to amounts already paid.</li>
  <li>All refunds are wallet store credit — not returned to your original payment method.</li>
</ul>
<h2>Provider cancel</h2>
<p>Full wallet refund for amounts already paid — rebook from Bookings or Search.</p>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'refunds-and-cancellation-fees' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  body = '{{customer_name}} has cancelled their booking on {{booking_date}} at {{booking_time}}. Services: {{services}}. {{financial_summary}}',
  email_body = '<h2>Booking Cancelled</h2><p>A customer has cancelled their booking.</p><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>Date:</strong> {{booking_date}}</p><p><strong>Time:</strong> {{booking_time}}</p><p><strong>Services:</strong> {{services}}</p><p>{{financial_summary}}</p><p>Booking ID: {{booking_id}}</p>',
  variables = ARRAY['customer_name', 'booking_date', 'booking_time', 'services', 'booking_id', 'fee_retained', 'refund_issued', 'financial_summary']::TEXT[],
  updated_at = NOW()
WHERE key = 'provider_booking_cancelled';

UPDATE public.notification_templates
SET
  email_body = '<h2>Booking Cancelled</h2><p>{{provider_name}} has cancelled your booking on {{booking_date}}.</p><p><strong>Reason:</strong> {{cancellation_reason}}</p><p>{{refund_info}}</p><p>We apologize for the inconvenience.</p>',
  variables = ARRAY['provider_name', 'booking_date', 'booking_number', 'refund_info', 'booking_id', 'cancellation_reason']::TEXT[],
  updated_at = NOW()
WHERE key = 'booking_cancelled_by_provider';
