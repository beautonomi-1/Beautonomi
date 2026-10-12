-- Re-skin subscription lifecycle emails from migration 192 CSS layout to 542 inline table shell.

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
  email_body = _984_polished_email_shell(
    'Subscription upgraded',
    'Thanks, {{business_name}} — your plan change is active.',
    _984_detail_row('New plan', '{{plan_name}}')
      || _984_detail_row('Billing', '{{new_amount}}/{{billing_period}}')
      || _984_detail_row('Previous plan', '{{old_plan_name}}')
      || _984_detail_row('Next payment', '{{next_payment_date}}', FALSE),
    '',
    '{{app_url}}/provider/dashboard',
    'View dashboard'
  ),
  updated_at = NOW()
WHERE key = 'subscription_upgraded' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_body = _984_polished_email_shell(
    'Subscription changed',
    'Your Beautonomi subscription plan has been updated.',
    _984_detail_row('New plan', '{{plan_name}}')
      || _984_detail_row('Billing', '{{new_amount}}/{{billing_period}}')
      || _984_detail_row('Previous plan', '{{old_plan_name}}')
      || _984_detail_row('Effective', '{{effective_date}}', FALSE),
    '',
    '{{app_url}}/provider/dashboard',
    'View dashboard'
  ),
  updated_at = NOW()
WHERE key = 'subscription_downgraded' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_body = _984_polished_email_shell(
    'Subscription cancelled',
    'Your access continues until the date below.',
    _984_detail_row('Plan', '{{plan_name}}')
      || _984_detail_row('Access until', '{{expires_at}}', FALSE),
    '<p style="margin:20px 0 0;color:#475569;font-size:14px;line-height:1.6;">You can reactivate anytime before access ends.</p>',
    '{{app_url}}/provider/dashboard',
    'Reactivate subscription'
  ),
  updated_at = NOW()
WHERE key = 'subscription_cancelled' AND tenant_id IS NULL;

UPDATE public.notification_templates
SET
  email_body = _984_polished_email_shell(
    'Subscription renewed',
    'Your subscription renewed successfully.',
    _984_detail_row('Plan', '{{plan_name}}')
      || _984_detail_row('Amount', '{{amount}}/{{billing_period}}')
      || _984_detail_row('Next payment', '{{next_payment_date}}', FALSE),
    '',
    '{{app_url}}/provider/dashboard',
    'View dashboard'
  ),
  updated_at = NOW()
WHERE key = 'subscription_renewed' AND tenant_id IS NULL;

DROP FUNCTION IF EXISTS _984_detail_row(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS _984_polished_email_shell(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
