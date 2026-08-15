-- Staff invitation email: primary CTA is set-password (recovery → join), join link secondary.

UPDATE public.notification_templates
SET email_body = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
    <h1 style="font-size:20px;margin:0 0 16px;">You''re invited to {{business_name}}</h1>
    <p style="margin:0 0 16px;color:#4b5563;">Hi {{staff_name}}, {{inviter_name}} invited you to join their team on Beautonomi.</p>
    <p style="margin:0 0 8px;font-weight:600;">1. Set your password</p>
    <p style="margin:0 0 16px;">
      <a href="{{set_password_url}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Set password &amp; join</a>
    </p>
    <p style="margin:0 0 8px;font-weight:600;">2. Accept your invite</p>
    <p style="margin:0 0 16px;font-size:12px;color:#6b7280;">Already have access? Paste this link:<br/><span style="word-break:break-all;">{{join_url}}</span></p>
    <p style="margin:24px 0 8px;font-weight:600;color:#111827;">3. Get the Provider app</p>
    <p style="margin:0 0 4px;color:#4b5563;">Manage bookings, clients and payments on the go.</p>
    <ul style="margin:8px 0;padding-left:18px;color:#2563eb;">
      <li><a href="{{ios_url}}" style="color:#2563eb;">iPhone — App Store</a></li>
      <li><a href="{{android_url}}" style="color:#2563eb;">Android — Google Play</a></li>
    </ul>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Reply to this email and we''ll help.</p>
  </div>'
WHERE key = 'staff_invitation'
  AND tenant_id IS NULL;
