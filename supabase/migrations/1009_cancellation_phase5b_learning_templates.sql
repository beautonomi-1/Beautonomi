-- Phase 5b: recurring-series cancel templates, emergency copy, wallet bank-refund status
-- templates, and Learning Center articles aligned with resolveCancellationOutcome.
-- Global templates use partial unique index uniq_notification_templates_global (key) WHERE tenant_id IS NULL (see 354).

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
)
VALUES
(
  NULL,
  'recurring_series_cancelled',
  'Repeating booking stopped',
  'Your repeating {{service_name}} booking with {{provider_name}} has been stopped. Appointments already on the calendar are unchanged — cancel those from the booking if you need to. Any refund then goes to your Beautonomi wallet.',
  ARRAY['push', 'email']::TEXT[],
  'Your repeating booking with {{provider_name}} has been stopped',
  '<p>Hi {{customer_name}},</p><p>Your repeating <strong>{{service_name}}</strong> booking with <strong>{{provider_name}}</strong> has been stopped. No new appointments will be created.</p><p>Appointments already on the calendar are unchanged — cancel those from the booking if you need to. Any refund then goes to your Beautonomi wallet.</p>',
  NULL,
  ARRAY['customer_name', 'service_name', 'provider_name', 'recurring_series_id']::TEXT[],
  '/bookings',
  true,
  'Sent to the customer when they stop a recurring appointment series'
),
(
  NULL,
  'provider_recurring_series_cancelled',
  'Repeating booking stopped',
  '{{customer_name}} stopped their repeating {{service_name}} booking. Appointments already on the calendar are unchanged.',
  ARRAY['push', 'email']::TEXT[],
  'Repeating booking stopped — {{customer_name}}',
  '<p>{{customer_name}} stopped their repeating <strong>{{service_name}}</strong> booking. No new appointments will be created.</p><p>Appointments already on the calendar are unchanged and follow your cancellation policy if the client cancels them.</p>',
  NULL,
  ARRAY['customer_name', 'service_name', 'provider_name', 'recurring_series_id']::TEXT[],
  '/bookings',
  true,
  'Sent to the provider when a customer stops a recurring appointment series'
),
(
  NULL,
  'wallet_bank_refund_requested',
  'Bank refund request received',
  'We received your bank refund request {{request_number}} for {{amount}}. The amount is on hold in your wallet while our team reviews it.',
  ARRAY['push', 'email']::TEXT[],
  'Bank refund request {{request_number}} received',
  '<p>We received your bank refund request <strong>{{request_number}}</strong> for <strong>{{amount}}</strong> to {{bank_name}} ending {{account_last4}}.</p><p>The amount is on hold in your wallet while our team reviews it. You can cancel the request from your wallet until it is approved.</p>',
  NULL,
  ARRAY['request_number', 'amount', 'net_amount', 'bank_name', 'account_last4']::TEXT[],
  '/account-settings/wallet',
  true,
  'Sent when a customer submits a wallet bank refund request'
),
(
  NULL,
  'wallet_bank_refund_approved',
  'Bank refund approved',
  'Your bank refund {{request_number}} for {{net_amount}} was approved and will be paid to {{bank_name}} ending {{account_last4}}.',
  ARRAY['push', 'email']::TEXT[],
  'Bank refund {{request_number}} approved',
  '<p>Your bank refund <strong>{{request_number}}</strong> was approved. <strong>{{net_amount}}</strong> will be paid to {{bank_name}} ending {{account_last4}}.</p><p>We will let you know once the transfer has been sent.</p>',
  NULL,
  ARRAY['request_number', 'amount', 'net_amount', 'bank_name', 'account_last4']::TEXT[],
  '/account-settings/wallet',
  true,
  'Sent when finance approves a wallet bank refund request'
),
(
  NULL,
  'wallet_bank_refund_paid',
  'Bank refund sent',
  'Your bank refund {{request_number}} of {{net_amount}} has been sent to {{bank_name}} ending {{account_last4}}. Reference: {{payout_reference}}.',
  ARRAY['push', 'email']::TEXT[],
  'Bank refund {{request_number}} sent',
  '<p>Your bank refund <strong>{{request_number}}</strong> of <strong>{{net_amount}}</strong> has been sent to {{bank_name}} ending {{account_last4}}.</p><p>Reference: {{payout_reference}}. Bank transfers can take 1–3 business days to reflect.</p>',
  NULL,
  ARRAY['request_number', 'amount', 'net_amount', 'bank_name', 'account_last4', 'payout_reference']::TEXT[],
  '/account-settings/wallet',
  true,
  'Sent when finance marks a wallet bank refund as paid'
),
(
  NULL,
  'wallet_bank_refund_rejected',
  'Bank refund not approved',
  'Your bank refund request {{request_number}} was not approved. {{amount}} is back in your Beautonomi wallet. {{reason}}',
  ARRAY['push', 'email']::TEXT[],
  'Bank refund request {{request_number}} not approved',
  '<p>Your bank refund request <strong>{{request_number}}</strong> was not approved.</p><p><strong>{{amount}}</strong> is back in your Beautonomi wallet.</p><p>{{reason}}</p>',
  NULL,
  ARRAY['request_number', 'amount', 'reason']::TEXT[],
  '/account-settings/wallet',
  true,
  'Sent when finance rejects a wallet bank refund request'
),
(
  NULL,
  'wallet_bank_refund_cancelled',
  'Bank refund request cancelled',
  'Your bank refund request {{request_number}} was cancelled. {{amount}} is back in your Beautonomi wallet.',
  ARRAY['push', 'email']::TEXT[],
  'Bank refund request {{request_number}} cancelled',
  '<p>Your bank refund request <strong>{{request_number}}</strong> was cancelled.</p><p><strong>{{amount}}</strong> is back in your Beautonomi wallet.</p>',
  NULL,
  ARRAY['request_number', 'amount']::TEXT[],
  '/account-settings/wallet',
  true,
  'Sent when a customer cancels a pending wallet bank refund request'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Emergency cancellation: {{refund_info}} is built from resolveCancellationOutcome (wallet credit of
-- platform-collected money; in-person payments returned by the provider). No fee is ever retained.
UPDATE public.notification_templates
SET
  body = 'Your booking with {{provider_name}} has been cancelled due to an emergency. No cancellation fee applies. {{refund_info}}',
  email_body = '<h2>Emergency Cancellation</h2><p>Your booking has been cancelled due to an emergency situation.</p><p><strong>Provider:</strong> {{provider_name}}</p><p><strong>Date:</strong> {{booking_date}}</p><p><strong>Reason:</strong> {{emergency_reason}}</p><p>No cancellation fee applies. {{refund_info}}</p><p>We are sorry for the inconvenience. You can rebook with {{provider_name}} or find another provider from Search.</p>',
  sms_body = 'Emergency: Booking with {{provider_name}} on {{booking_date}} cancelled. No fee applies. {{refund_info}}',
  updated_at = NOW()
WHERE key = 'booking_cancelled_emergency' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'Cancel from booking detail and see your exact fee and wallet refund before you confirm.',
  body = $body$<p>Open the booking from <strong>Bookings</strong> and choose <strong>Cancel</strong>. Before you confirm, you see the provider's cancellation policy, any fee, and the amount that will be credited to your Beautonomi wallet.</p>
<h2>How the amount is worked out</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel from booking detail — policy applies"></div>
<ul>
  <li>The policy that applies is the one shown when you booked. If the provider later makes their policy more flexible, the more flexible terms apply.</li>
  <li>No fee applies if you cancel before the provider's cutoff, within the short grace period after booking, while the booking is still awaiting confirmation, or after the provider has moved your appointment.</li>
  <li>Any fee is charged only on the service amount — never on a tip — and never exceeds what you paid online through Beautonomi.</li>
  <li>Money you paid in person (cash or a card machine at the venue) has no cancellation fee. Your provider returns it to you directly.</li>
  <li>You can cancel up until your appointment time. After that, contact the provider or support.</li>
</ul>
<h2>Where the refund goes</h2>
<p>Refunds are credited to your Beautonomi wallet and can be used on your next booking. Bank refund of an eligible card payment is available on request.</p>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'canceling-your-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'No fee when your provider cancels — online payments are credited to your wallet.',
  body = $body$<p>If your provider cancels, you are notified and no cancellation fee applies. Everything you paid online through Beautonomi is credited to your Beautonomi wallet. Money you paid in person is returned to you by the provider.</p>
<h2>What to do next</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Rebook from Bookings or find a new provider"></div>
<ul>
  <li>Check your wallet balance in Profile.</li>
  <li>Rebook the same provider or find another from Search.</li>
  <li>Bank refund of an eligible card payment is available on request.</li>
  <li>Contact support if you expected wallet credit but do not see it.</li>
</ul>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'if-provider-cancels' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET
  summary = 'How cancellation fees and wallet refunds work for you and your provider.',
  body = $body$<p>Each provider sets a cancellation policy, shown on their profile and at checkout. The policy you see when you book is the one that applies, unless the provider later makes it more flexible.</p>
<h2>When you cancel</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel from booking detail — policy applies"></div>
<ul>
  <li><strong>Before the cutoff:</strong> no fee — everything you paid online is credited to your wallet.</li>
  <li><strong>After the cutoff:</strong> the provider's late-cancellation terms apply. The fee is charged on the service amount only (tips are always returned) and never exceeds what you paid online.</li>
  <li><strong>No fee</strong> during the grace period after booking, while the booking awaits confirmation, or if the provider moved your appointment.</li>
  <li><strong>In-person payments</strong> (cash or a card machine at the venue) carry no cancellation fee and are returned to you by the provider.</li>
</ul>
<h2>When the provider cancels</h2>
<p>No fee applies. Everything you paid online is credited to your wallet.</p>
<h2>Wallet and bank refunds</h2>
<p>Refunds are credited to your Beautonomi wallet for your next booking. Bank refund of an eligible card payment is available on request.</p>$body$,
  content_format = 'html',
  updated_at = NOW()
WHERE slug = 'refunds-and-cancellation-fees' AND tenant_id IS NULL;
