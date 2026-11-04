-- Group booking split/invite: customer RLS via participant.customer_id + notification templates.

-- Customers can see groups they are rostered on without a child booking row.
DROP POLICY IF EXISTS "Customers can view group bookings via participant customer_id" ON public.group_bookings;
CREATE POLICY "Customers can view group bookings via participant customer_id"
  ON public.group_bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.booking_participants bp
      WHERE bp.group_booking_id = group_bookings.id
        AND bp.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Customers can view participant records by customer_id" ON public.booking_participants;
CREATE POLICY "Customers can view participant records by customer_id"
  ON public.booking_participants FOR SELECT
  USING (customer_id = auth.uid());

-- group_booking_invites: no policies — service role only (RLS enabled in 1034).

INSERT INTO public.notification_templates (
  tenant_id,
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  variables,
  url,
  enabled,
  description
)
VALUES
  (
    NULL,
    'group_invite_guest',
    'Group booking invite',
    '{{inviter_name}} invited you to join a group booking at {{provider_name}}. Open the link to view details and pay your share.',
    ARRAY['push', 'email']::TEXT[],
    'You''re invited — group booking at {{provider_name}}',
    '<h2>Group booking invite</h2><p>{{inviter_name}} added you to a group appointment at <strong>{{provider_name}}</strong>.</p><p><a href="{{invite_url}}">View invite</a></p>',
    ARRAY['inviter_name', 'provider_name', 'invite_url', 'group_booking_id', 'amount_due', 'currency']::TEXT[],
    NULL,
    true,
    'Sent when a guest receives a group booking invite link (split or roster-only)'
  ),
  (
    NULL,
    'group_share_paid',
    'Guest paid their share',
    '{{guest_name}} paid {{amount}} for your group booking.',
    ARRAY['push', 'email']::TEXT[],
    'Group booking — {{guest_name}} paid their share',
    '<p><strong>{{guest_name}}</strong> paid <strong>{{amount}}</strong> toward your group booking at {{provider_name}}.</p>',
    ARRAY['guest_name', 'amount', 'currency', 'provider_name', 'booking_id', 'group_booking_id']::TEXT[],
    '/account-settings/group-bookings',
    true,
    'Sent to the primary contact when a guest completes a split share payment'
  ),
  (
    NULL,
    'group_guest_cancelled',
    'Guest cancelled their spot',
    '{{guest_name}} cancelled their spot in your group booking.',
    ARRAY['push', 'email']::TEXT[],
    'Group booking update — {{guest_name}} cancelled',
    '<p><strong>{{guest_name}}</strong> cancelled their spot in your group booking at {{provider_name}}.</p>',
    ARRAY['guest_name', 'provider_name', 'booking_id', 'group_booking_id']::TEXT[],
    '/account-settings/group-bookings',
    true,
    'Sent to the primary contact and provider when a guest self-cancels from a group'
  )
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();
