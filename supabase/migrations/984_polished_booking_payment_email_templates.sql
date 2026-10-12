-- Tier 1 customer transactional emails: 542-style inline HTML + restore email channel where 608/691 left push-only.

CREATE OR REPLACE FUNCTION _984_polished_email_shell(
  p_hero_title TEXT,
  p_hero_subtitle TEXT,
  p_detail_rows_html TEXT,
  p_middle_html TEXT DEFAULT '',
  p_cta_href TEXT DEFAULT NULL,
  p_cta_label TEXT DEFAULT NULL,
  p_footer TEXT DEFAULT 'This is an automatically generated Beautonomi notification.'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_subtitle TEXT := '';
  v_cta TEXT := '';
BEGIN
  IF p_hero_subtitle IS NOT NULL AND btrim(p_hero_subtitle) <> '' THEN
    v_subtitle := format(
      '<p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">%s</p>',
      replace(replace(replace(p_hero_subtitle, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    );
  END IF;

  IF p_cta_href IS NOT NULL AND btrim(p_cta_href) <> '' THEN
    v_cta := format(
      '<p style="text-align:center;margin:28px 0 4px;"><a href="%s" style="display:inline-block;background:#FF0077;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">%s</a></p>',
      replace(p_cta_href, '"', '&quot;'),
      replace(replace(replace(COALESCE(NULLIF(btrim(p_cta_label), ''), 'View in Beautonomi'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    );
  END IF;

  RETURN '<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:32px 32px 28px;">
                <p style="margin:0 0 10px;color:#f9a8d4;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Beautonomi</p>
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-weight:700;">'
    || replace(replace(replace(p_hero_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    || '</h1>'
    || v_subtitle
    || '
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">'
    || p_detail_rows_html
    || '</table>'
    || COALESCE(p_middle_html, '')
    || v_cta
    || '
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fdf2f8;color:#9d174d;font-size:12px;text-align:center;">'
    || replace(replace(replace(p_footer, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    || '
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>';
END;
$$;

CREATE OR REPLACE FUNCTION _984_detail_row(p_label TEXT, p_value TEXT, p_with_border BOOLEAN DEFAULT TRUE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format(
    '<tr><td style="padding:18px 20px;%s"><p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">%s</p><p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;">%s</p></td></tr>',
    CASE WHEN p_with_border THEN 'border-bottom:1px solid #e5e7eb;' ELSE '' END,
    replace(replace(replace(p_label, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    p_value
  );
$$;

-- booking_confirmed (CTA from runtime webUrl via notification_templates.url)
UPDATE public.notification_templates
SET
  email_subject = 'Booking confirmed — {{provider_name}}',
  email_body = _984_polished_email_shell(
    'Booking confirmed',
    'Your appointment with {{provider_name}} is set for {{booking_date}} at {{booking_time}}.',
    _984_detail_row('Provider', '{{provider_name}}')
      || _984_detail_row('Date', '{{booking_date}}')
      || _984_detail_row('Time', '{{booking_time}}')
      || _984_detail_row('Services', '{{services}}')
      || '<tr><td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Total</p><p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{total_amount}}</p>{{pricing_breakdown_html}}</td></tr>'
      || _984_detail_row('Booking number', '{{booking_number}}', FALSE),
    '',
    NULL,
    NULL
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email','sms']::TEXT[])),
  variables = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(variables, ARRAY[]::TEXT[])
        || ARRAY[
          'provider_name','booking_date','booking_time','services','total_amount','booking_number','booking_id',
          'pricing_breakdown_html','subtotal','tax_amount','travel_fee','platform_fee','service_fee',
          'membership_discount','membership_label','loyalty_discount','promotion_discount','package_discount','package_name','tip_amount'
        ]::TEXT[]
      )
    )
  ),
  updated_at = NOW()
WHERE key = 'booking_confirmed' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Reminder: booking tomorrow — {{provider_name}}',
  email_body = _984_polished_email_shell(
    'Booking tomorrow',
    'This is a friendly reminder about your upcoming appointment.',
    _984_detail_row('Provider', '{{provider_name}}')
      || _984_detail_row('Date', '{{booking_date}}')
      || _984_detail_row('Time', '{{booking_time}}')
      || _984_detail_row('Location', '{{location}}', FALSE)
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  updated_at = NOW()
WHERE key = 'booking_reminder_24h' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Booking cancelled — {{provider_name}}',
  email_body = _984_polished_email_shell(
    'Booking cancelled',
    'Your booking with {{provider_name}} on {{booking_date}} has been cancelled.',
    _984_detail_row('Provider', '{{provider_name}}')
      || _984_detail_row('Date', '{{booking_date}}')
      || _984_detail_row('Booking number', '{{booking_number}}', FALSE),
    '<p style="margin:20px 0 0;color:#475569;font-size:14px;line-height:1.6;">{{refund_info}}</p>'
  ),
  updated_at = NOW()
WHERE key = 'booking_cancelled' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Booking rescheduled — {{provider_name}}',
  email_body = _984_polished_email_shell(
    'Booking rescheduled',
    'Your appointment with {{provider_name}} has a new date and time.',
    _984_detail_row('New date', '{{new_date}}')
      || _984_detail_row('New time', '{{new_time}}')
      || _984_detail_row('Previous', '{{old_date}} at {{old_time}}', FALSE)
  ),
  updated_at = NOW()
WHERE key = 'booking_rescheduled' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Payment successful — booking #{{booking_number}}',
  email_body = _984_polished_email_shell(
    'Payment successful',
    'We received your payment for booking #{{booking_number}}.',
    _984_detail_row('Amount', '{{amount}}')
      || _984_detail_row('Payment method', '{{payment_method}}')
      || _984_detail_row('Transaction ID', '{{transaction_id}}', FALSE)
  ),
  sms_body = COALESCE(sms_body, 'Payment successful for booking #{{booking_number}}. Amount: {{amount}}.'),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  variables = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(variables, ARRAY[]::TEXT[])
        || ARRAY['amount','booking_number','booking_id','payment_method','transaction_id']::TEXT[]
      )
    )
  ),
  updated_at = NOW()
WHERE key = 'payment_successful' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Payment failed — action required',
  email_body = _984_polished_email_shell(
    'Payment failed',
    'We could not process your payment. Please update your payment method to keep your booking.',
    _984_detail_row('Amount', '{{amount}}')
      || _984_detail_row('Booking number', '{{booking_number}}')
      || _984_detail_row('Reason', '{{failure_reason}}', FALSE)
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email','sms']::TEXT[])),
  updated_at = NOW()
WHERE key = 'payment_failed' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Refund processed — booking #{{booking_number}}',
  email_body = _984_polished_email_shell(
    'Refund processed',
    'Your refund is on its way and should appear within 3–5 business days.',
    _984_detail_row('Amount', '{{amount}}')
      || _984_detail_row('Booking number', '{{booking_number}}')
      || _984_detail_row('Reason', '{{refund_reason}}', FALSE)
  ),
  sms_body = COALESCE(sms_body, 'Refund of {{amount}} processed for booking #{{booking_number}}.'),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  updated_at = NOW()
WHERE key = 'refund_processed' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'New message from {{provider_name}}',
  email_body = _984_polished_email_shell(
    'New message',
    '{{provider_name}} sent you a message on Beautonomi.',
    _984_detail_row('From', '{{provider_name}}')
      || _984_detail_row('Preview', '{{message_preview}}', FALSE)
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  updated_at = NOW()
WHERE key = 'customer_new_message' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'New message from {{sender_name}}',
  email_body = _984_polished_email_shell(
    'New customer message',
    '{{sender_name}} sent you a message on Beautonomi.',
    _984_detail_row('From', '{{sender_name}}')
      || _984_detail_row('Preview', '{{message_preview}}', FALSE)
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  updated_at = NOW()
WHERE key = 'provider_new_message' AND tenant_id IS NULL;

DROP FUNCTION IF EXISTS _984_detail_row(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS _984_polished_email_shell(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
