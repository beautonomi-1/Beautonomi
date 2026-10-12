-- Tier 2 provider transactional emails (542 inline shell).

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

UPDATE public.notification_templates
SET
  email_subject = 'New booking request — {{customer_name}}',
  email_body = _984_polished_email_shell(
    'New booking request',
    'You received a new booking request on Beautonomi.',
    _984_detail_row('Customer', '{{customer_name}}')
      || _984_detail_row('Date', '{{booking_date}}')
      || _984_detail_row('Time', '{{booking_time}}')
      || _984_detail_row('Services', '{{services}}')
      || _984_detail_row('Total', '{{total_amount}}', FALSE)
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  updated_at = NOW()
WHERE key = 'provider_booking_request' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'Payout processed — {{amount}}',
  email_body = _984_polished_email_shell(
    'Payout processed',
    'Your payout has been transferred to your account.',
    _984_detail_row('Amount', '{{amount}}')
      || _984_detail_row('Payout date', '{{payout_date}}')
      || _984_detail_row('Transaction ID', '{{transaction_id}}', FALSE),
    '',
    '{{app_url}}/provider/payouts',
    'View payouts'
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  variables = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(variables, ARRAY[]::TEXT[]) || ARRAY['app_url']::TEXT[]))
  ),
  updated_at = NOW()
WHERE key = 'provider_payout_processed' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_subject = 'New {{rating}}-star review from {{customer_name}}',
  email_body = _984_polished_email_shell(
    'New review',
    'A customer left feedback on your Beautonomi profile.',
    _984_detail_row('Customer', '{{customer_name}}')
      || _984_detail_row('Rating', '{{rating}} stars')
      || _984_detail_row('Review', '{{review_text}}', FALSE),
    '',
    '{{app_url}}/provider/reviews',
    'View reviews'
  ),
  channels = ARRAY(SELECT DISTINCT unnest(COALESCE(channels, ARRAY[]::TEXT[]) || ARRAY['push','email']::TEXT[])),
  variables = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(variables, ARRAY[]::TEXT[]) || ARRAY['app_url']::TEXT[]))
  ),
  updated_at = NOW()
WHERE key = 'provider_new_review' AND tenant_id IS NULL;

DROP FUNCTION IF EXISTS _984_detail_row(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS _984_polished_email_shell(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
