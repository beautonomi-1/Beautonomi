-- Customer-facing copy for POST /api/provider/bookings/[id]/request-payment (additional_charges row + notify).
-- Previously reused `partial_payment_received` ("Partial payment received"), which describes money already received,
-- not a provider-initiated extra line item awaiting payment.

INSERT INTO public.notification_templates (
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  sms_body,
  variables,
  url,
  enabled,
  description
)
SELECT
  'additional_charge_requested',
  'Additional payment requested',
  'Your provider added an extra charge: {{charge_description}} — {{charge_amount}}. Estimated balance due: {{remaining_balance}}. Booking #{{booking_number}}.',
  ARRAY['push', 'email']::TEXT[],
  'Additional payment requested — booking #{{booking_number}}',
  '<h2>Additional payment requested</h2>'
    || '<p>Your provider added a charge to this booking. Open your booking to review and pay online.</p>'
    || '<p><strong>Description:</strong> {{charge_description}}</p>'
    || '<p><strong>Amount:</strong> {{charge_amount}}</p>'
    || '<p><strong>Estimated balance due:</strong> {{remaining_balance}}</p>'
    || '<p><strong>Booking number:</strong> {{booking_number}}</p>',
  'Extra charge from your provider: {{charge_description}} {{charge_amount}}. Balance due about {{remaining_balance}}. Booking #{{booking_number}}.',
  ARRAY['charge_amount', 'charge_description', 'remaining_balance', 'booking_number', 'booking_id']::TEXT[],
  '/account-settings/bookings/{{booking_id}}',
  true,
  'Sent when a provider creates an additional charge (request-payment) during or after service; customer pays online or staff marks paid.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = 'additional_charge_requested'
);
