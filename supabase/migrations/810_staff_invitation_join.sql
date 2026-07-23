-- Staff invitation tokens + notification template for mobile-first team join

ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS invite_token UUID,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_staff_invite_token
  ON public.provider_staff (invite_token)
  WHERE invite_token IS NOT NULL;

COMMENT ON COLUMN public.provider_staff.invite_token IS 'UUID token for /provider/join?token= links; rotated on each invite send.';
COMMENT ON COLUMN public.provider_staff.invite_token_expires_at IS 'Invite link expiry (default 14 days from send).';
COMMENT ON COLUMN public.provider_staff.invite_sent_at IS 'Last time an invite was sent to this staff member.';
COMMENT ON COLUMN public.provider_staff.invite_accepted_at IS 'When the invitee completed join (set password + portal entry).';

-- ── staff_invitation notification template ───────────────────────────────────
INSERT INTO public.notification_templates (
  key, title, body, channels, email_subject, email_body, variables, url, description
)
SELECT
  'staff_invitation',
  'You''re invited to {{business_name}}',
  'Join {{business_name}} on the Beautonomi Provider app: {{join_url}}',
  ARRAY['email', 'push']::TEXT[],
  'Join {{business_name}} on Beautonomi',
  '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
    <h1 style="font-size:20px;margin:0 0 16px;">You''re invited to {{business_name}}</h1>
    <p style="margin:0 0 16px;color:#4b5563;">Hi {{staff_name}}, {{inviter_name}} invited you to join their team on Beautonomi.</p>
    <p style="margin:0 0 8px;font-weight:600;">1. Accept your invite</p>
    <p style="margin:0 0 16px;">
      <a href="{{join_url}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Join the team</a>
    </p>
    <p style="margin:0 0 16px;font-size:12px;color:#6b7280;">Or paste this link:<br/><span style="word-break:break-all;">{{join_url}}</span></p>
    <p style="margin:24px 0 8px;font-weight:600;color:#111827;">2. Get the Provider app</p>
    <p style="margin:0 0 4px;color:#4b5563;">Manage bookings, clients and payments on the go.</p>
    <ul style="margin:8px 0;padding-left:18px;color:#2563eb;">
      <li><a href="{{ios_url}}" style="color:#2563eb;">iPhone — App Store</a></li>
      <li><a href="{{android_url}}" style="color:#2563eb;">Android — Google Play</a></li>
    </ul>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Reply to this email and we''ll help.</p>
  </div>',
  ARRAY[
    'staff_name', 'business_name', 'inviter_name', 'join_url',
    'set_password_url', 'ios_url', 'android_url', 'huawei_url'
  ]::TEXT[],
  '/provider/join?token={{invite_token}}',
  'Sent when a provider owner/manager invites a team member. Promotes Provider app download + join link.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'staff_invitation' AND nt.tenant_id IS NULL
);

-- Managers with manage_team may insert/update staff rows (API uses service role; belt-and-braces for direct client)
CREATE OR REPLACE FUNCTION public.staff_has_manage_team(p_provider_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF is_provider_owner(p_provider_id) THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM provider_staff ps
    WHERE ps.provider_id = p_provider_id
      AND ps.user_id = auth.uid()
      AND ps.is_active = TRUE
      AND (
        ps.role IN ('owner', 'manager')
        OR ps.is_admin = TRUE
        OR COALESCE((ps.permissions->>'manage_team')::boolean, FALSE) = TRUE
        OR COALESCE((ps.permissions->>'manage_staff')::boolean, FALSE) = TRUE
      )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS "Managers with manage_team can manage staff" ON provider_staff;
CREATE POLICY "Managers with manage_team can manage staff"
  ON provider_staff FOR ALL
  USING (staff_has_manage_team(provider_id))
  WITH CHECK (staff_has_manage_team(provider_id));
