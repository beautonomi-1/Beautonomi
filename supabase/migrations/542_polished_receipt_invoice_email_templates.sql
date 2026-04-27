-- Upgrade financial notification emails from plain snippets to polished,
-- email-client friendly HTML while keeping the existing template variables.

UPDATE public.notification_templates
SET
  email_subject = 'Your Beautonomi receipt - booking #{{booking_number}}',
  email_body = $beautonomi_email$
<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:32px 32px 28px;">
                <p style="margin:0 0 10px;color:#f9a8d4;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Beautonomi</p>
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-weight:700;">Receipt</h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">Thank you. Your payment receipt is ready for booking #{{booking_number}}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Booking number</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:18px;font-weight:700;">#{{booking_number}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Total amount</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{total_amount}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Payment date</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;">{{payment_date}}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#475569;font-size:14px;">You can view or download the receipt from your booking details. Keep this email for your records.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fdf2f8;color:#9d174d;font-size:12px;text-align:center;">
                This is an automatically generated Beautonomi receipt.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
$beautonomi_email$,
  updated_at = NOW()
WHERE key = 'receipt_sent';

UPDATE public.notification_templates
SET
  email_subject = 'Your Beautonomi invoice - booking #{{booking_number}}',
  email_body = $beautonomi_email$
<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:32px 32px 28px;">
                <p style="margin:0 0 10px;color:#f9a8d4;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Beautonomi</p>
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-weight:700;">Invoice generated</h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">Your invoice is ready for booking #{{booking_number}}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Invoice number</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:18px;font-weight:700;">{{invoice_number}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Booking number</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:18px;font-weight:700;">#{{booking_number}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Total amount</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{total_amount}}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#475569;font-size:14px;">Download the invoice from the booking details page when you need a printable copy.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fdf2f8;color:#9d174d;font-size:12px;text-align:center;">
                This is an automatically generated Beautonomi invoice.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
$beautonomi_email$,
  updated_at = NOW()
WHERE key = 'invoice_generated';
