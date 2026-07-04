-- ============================================================================
-- Migration 738: Provider subscription receipt notification template
-- ============================================================================
-- Emails (and pushes) a receipt to the provider on EVERY recognized subscription
-- charge — initial order, card authorization, and recurring renewal — sent from
-- the single money choke point recordProviderSubscriptionPayment(). Includes a
-- signed, long-lived link to the receipt PDF ({{receipt_url}}).
-- ============================================================================

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_receipt',
  'Your Subscription Receipt',
  'We received your {{plan_name}} subscription payment of {{amount}}. Your receipt is ready.',
  'Your Beautonomi receipt - {{plan_name}} ({{amount}})',
  '<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:32px 32px 28px;">
                <p style="margin:0 0 10px;color:#f9a8d4;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Beautonomi</p>
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-weight:700;">Subscription receipt</h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">Thanks, {{business_name}} — your {{plan_name}} subscription payment was received.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Plan</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:18px;font-weight:700;">{{plan_name}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Amount paid</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{amount}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Payment date</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;">{{payment_date}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reference</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;">{{reference}}</p>
                    </td>
                  </tr>
                </table>
                <p style="text-align:center;margin:28px 0 4px;">
                  <a href="{{receipt_url}}" style="display:inline-block;background:#FF0077;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">Download receipt (PDF)</a>
                </p>
                <p style="margin:16px 0 0;color:#475569;font-size:13px;text-align:center;">You can also find all receipts anytime under Settings &rarr; Billing.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fdf2f8;color:#9d174d;font-size:12px;text-align:center;">
                This is an automatically generated Beautonomi subscription receipt.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  'Beautonomi: your {{plan_name}} subscription payment of {{amount}} was received. Download your receipt: {{receipt_url}}',
  ARRAY['push', 'email'],
  ARRAY['business_name', 'plan_name', 'amount', 'payment_date', 'reference', 'payment_kind', 'receipt_url', 'app_url', 'year'],
  TRUE,
  'Sent to a provider on every recognized subscription charge (initial, authorization, renewal) with a signed link to the receipt PDF.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_receipt');
