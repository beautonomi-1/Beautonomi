/**
 * Group Booking Notifications
 * Send notifications to registered participants in a group booking.
 *
 * Server-side callers must not call protected internal API routes such as
 * /api/notifications/send-email because those endpoints require a provider or
 * admin session and public booking flows do not have one. This module sends
 * directly through the notification service after resolving a participant to a
 * Beautonomi user by customer_id, email, or phone.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendToUser } from '@/lib/notifications/onesignal';
import { enqueueMultiChannel } from '@/lib/notifications/enqueue';
import { insertNotification } from '@/lib/notifications/insert-notification';
import { getGroupBooking } from './group-booking';
import { hashGroupInviteToken } from './group-invites';
import { resolveTwilioCredentials, sendTwilioSMS } from '@/lib/integrations/twilio';
import { sendResendEmail } from '@/lib/integrations/resend';
import { getTenantRegionConfig } from '@/lib/regions/config';
import { getTenantLocaleTagFromRegionConfig } from '@/lib/locale/tenant-locale';

type GroupNotificationParticipant = {
  id?: string | null;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  is_primary_contact: boolean;
  customer_id?: string | null;
};

export type SendGroupBookingNotificationsOptions = {
  /** When true, skip the primary contact (e.g. online checkout already sent booking_confirmed). */
  skipPrimaryContact?: boolean;
  /** Split-payment guests: invite link (and share) keyed by booking_participants.id. */
  invitesByParticipantId?: Record<string, GroupGuestInvite>;
  /** Notify only this participant (invite re-send). */
  onlyParticipantId?: string;
};

export type GroupGuestInvite = {
  token: string;
  amountDue: number | null;
  currency: string | null;
};

/**
 * Send booking confirmation to every participant that maps to a user account.
 * Guests without a user account receive walk-in email/SMS via Resend/Twilio.
 */
export async function sendGroupBookingNotifications(
  supabase: SupabaseClient,
  bookingId: string,
  groupBookingId?: string,
  options?: SendGroupBookingNotificationsOptions,
): Promise<void> {
  let participants: GroupNotificationParticipant[] = [];

  if (groupBookingId) {
    const groupBooking = await getGroupBooking(supabase, groupBookingId);
    if (groupBooking) {
      participants = groupBooking.participants.map((p) => ({
        id: (p as { id?: string | null }).id ?? null,
        participant_name: p.participant_name,
        participant_email: p.participant_email,
        participant_phone: p.participant_phone,
        is_primary_contact: p.is_primary_contact,
        customer_id: p.customer_id,
      }));
    }
  } else {
    const { data: bookingParticipants } = await supabase
      .from('booking_participants')
      .select('id, participant_name, participant_email, participant_phone, is_primary_contact, customer_id')
      .eq('booking_id', bookingId);

    if (bookingParticipants) {
      participants = bookingParticipants as GroupNotificationParticipant[];
    }
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_number, scheduled_at, provider_id, location_type, tenant_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return;

  const tenantRegion = await getTenantRegionConfig(
    (booking as { tenant_id?: string | null }).tenant_id ?? null,
  );
  const formatLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);

  const { data: provider } = await supabase
    .from('providers')
    .select('business_name, slug')
    .eq('id', booking.provider_id)
    .maybeSingle();

  for (const participant of participants) {
    if (options?.skipPrimaryContact && participant.is_primary_contact) {
      continue;
    }
    if (options?.onlyParticipantId && participant.id !== options.onlyParticipantId) {
      continue;
    }

    const userId = await resolveParticipantUserId(supabase, participant);
    const walkInChannels = {
      email: Boolean(participant.participant_email),
      sms: Boolean(participant.participant_phone),
    };
    const invite =
      !participant.is_primary_contact && participant.id
        ? options?.invitesByParticipantId?.[participant.id] ?? null
        : null;

    if (userId) {
      await sendGroupBookingConfirmation(
        supabase,
        userId,
        participant.participant_name,
        booking,
        provider,
        participant.is_primary_contact,
        formatLocale,
        groupBookingId,
        invite,
      );
      continue;
    }

    await sendWalkInGroupBookingConfirmation(
      supabase,
      participant,
      booking,
      provider,
      walkInChannels,
      formatLocale,
      invite,
    );
  }
}

async function resolveParticipantUserId(
  supabase: SupabaseClient,
  participant: Pick<
    GroupNotificationParticipant,
    'customer_id' | 'participant_email' | 'participant_phone'
  >
): Promise<string | null> {
  if (participant.customer_id) return participant.customer_id;

  if (participant.participant_email) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', participant.participant_email)
      .maybeSingle();
    if (user?.id) return user.id as string;
  }

  if (participant.participant_phone) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', participant.participant_phone)
      .maybeSingle();
    if (user?.id) return user.id as string;
  }

  return null;
}

function buildGroupConfirmationCopy(
  name: string,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
  },
  provider: { business_name?: string | null } | null,
  isPrimary: boolean,
  formatLocale: string,
  invite?: GroupGuestInvite | null,
): { title: string; message: string; pushMessage: string } {
  const scheduledDate = new Date(booking.scheduled_at || Date.now());
  const dateStr = scheduledDate.toLocaleDateString(formatLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString(formatLocale, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';
  const bookingNumber = booking.booking_number || booking.id;

  const title = isPrimary
    ? `Group Booking Confirmation - ${bookingNumber}`
    : `You're Invited to a Group Booking - ${bookingNumber}`;

  const inviteUrl = invite ? groupInviteUrl(invite.token) : null;
  const shareText =
    invite && invite.amountDue != null && invite.amountDue > 0
      ? formatShareAmount(invite.amountDue, invite.currency, formatLocale)
      : null;

  const pushMessage = isPrimary
    ? `Your group booking ${bookingNumber} is confirmed for ${dateStr} at ${timeStr}.`
    : shareText
      ? `You're invited to a group booking on ${dateStr} at ${timeStr}. Pay your share of ${shareText} to confirm your spot.`
      : `You're invited to a group booking on ${dateStr} at ${timeStr}.`;

  const message = `
Hi ${name},

${isPrimary ? 'Your group booking has been confirmed!' : "You've been added to a group booking!"}

Booking Details:
- Booking Number: ${bookingNumber}
- Date & Time: ${dateStr} at ${timeStr}
- Provider: ${provider?.business_name || 'Beautonomi Partner'}
- Location: ${booking.location_type === 'at_salon' ? 'At Salon' : 'At Home'}

${
  isPrimary
    ? 'As the primary contact, you are responsible for this booking. All participants will receive their own confirmation.'
    : inviteUrl
      ? `Each guest pays their own share for this booking.${shareText ? ` Your share is ${shareText}.` : ''}`
      : 'The primary contact will handle payment and coordination for this group booking.'
}

${inviteUrl ? `Accept your invite${shareText ? ' and pay your share' : ''}:\n${inviteUrl}` : `View your booking:\n${appUrl}/account-settings/bookings`}

Best regards,
Beautonomi Team
  `.trim();

  return { title, message, pushMessage };
}

export function groupInviteUrl(token: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com').replace(/\/$/, '');
  return `${appUrl}/group-invite/${encodeURIComponent(token)}`;
}

function formatShareAmount(amount: number, currency: string | null, locale: string): string {
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function messageToHtml(body: string): string {
  return `<p>${body.replace(/\n+/g, '</p><p>')}</p>`;
}

export async function sendGroupGuestEmail(
  supabase: SupabaseClient,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    await sendResendEmail({
      supabase,
      to,
      subject,
      text: body,
      html: messageToHtml(body),
    });
  } catch (err) {
    console.warn(
      '[group booking notifications] walk-in email failed',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Cancellation notice for group participants without a Beautonomi account:
 * they cannot receive push or in-app messages, so email and SMS are the only
 * channels. Participants with an account are skipped (the caller notifies them).
 */
export async function notifyGroupGuestsWithoutAccountsOfCancellation(
  supabase: SupabaseClient,
  input: {
    participants: Array<{
      participant_name?: string | null;
      participant_email?: string | null;
      participant_phone?: string | null;
    }>;
    providerId?: string | null;
    bookingRef: string;
    cancelledBy: 'customer' | 'provider';
  },
): Promise<{ notified: number }> {
  let smsCreds: Awaited<ReturnType<typeof resolveTwilioCredentials>> | null | undefined;
  const loadSmsCreds = async () => {
    if (smsCreds !== undefined) return smsCreds;
    smsCreds = null;
    if (!input.providerId) return smsCreds;
    const { data: providerRow } = await supabase
      .from('providers')
      .select('tenant_id')
      .eq('id', input.providerId)
      .maybeSingle();
    const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    if (tenantId) smsCreds = await resolveTwilioCredentials(supabase, tenantId);
    return smsCreds;
  };
  let notified = 0;

  for (const participant of input.participants) {
    const email = participant.participant_email?.trim() || null;
    const phone = participant.participant_phone?.trim() || null;
    if (!email && !phone) continue;
    if (email) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if ((existingUser as { id?: string } | null)?.id) continue;
    }

    const name = participant.participant_name?.trim() || 'there';
    const who = input.cancelledBy === 'provider' ? 'the provider has cancelled' : 'the organiser has cancelled';
    const message =
      `Hi ${name}, ${who} group booking ${input.bookingRef}. ` +
      'Any amount you paid online toward your share is refunded in full to the card you paid with.';

    if (email) {
      await sendGroupGuestEmail(supabase, email, `Group booking ${input.bookingRef} cancelled`, message);
    }
    if (phone) {
      try {
        const creds = await loadSmsCreds();
        if (creds?.smsFrom) await sendTwilioSMS(creds, phone, message);
      } catch (error) {
        console.warn('[group booking notifications] guest cancel SMS error:', error);
      }
    }
    notified += 1;
  }
  return { notified };
}

async function sendWalkInGroupBookingConfirmation(
  supabase: SupabaseClient,
  participant: GroupNotificationParticipant,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
    provider_id?: string | null;
  },
  provider: { business_name?: string | null } | null,
  channels: { email: boolean; sms: boolean },
  formatLocale: string,
  invite?: GroupGuestInvite | null,
): Promise<void> {
  const { title, message } = buildGroupConfirmationCopy(
    participant.participant_name,
    booking,
    provider,
    participant.is_primary_contact,
    formatLocale,
    invite,
  );

  if (channels.email && participant.participant_email) {
    try {
      await sendGroupGuestEmail(supabase, participant.participant_email, title, message);
    } catch (error) {
      console.warn('[group booking notifications] walk-in email error:', error);
    }
  }

  if (channels.sms && participant.participant_phone && booking.provider_id) {
    try {
      const { data: providerRow } = await supabase
        .from('providers')
        .select('tenant_id')
        .eq('id', booking.provider_id)
        .maybeSingle();
      const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id;
      if (!tenantId) {
        console.warn('[group booking notifications] provider tenant missing; skipping walk-in SMS');
      } else {
        const creds = await resolveTwilioCredentials(supabase, tenantId);
        if (creds?.smsFrom) {
          await sendTwilioSMS(creds, participant.participant_phone, message);
        } else {
          console.warn('[group booking notifications] SMS not configured; skipping walk-in SMS');
        }
      }
    } catch (error) {
      console.warn('[group booking notifications] walk-in SMS error:', error);
    }
  }

  if (!channels.email && !channels.sms) {
    console.warn('[group booking notifications] walk-in participant has no contact channels', {
      email: participant.participant_email,
      phone: participant.participant_phone,
    });
  }
}

async function sendGroupBookingConfirmation(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
    provider_id?: string | null;
    tenant_id?: string | null;
  },
  provider: { business_name?: string | null } | null,
  isPrimary: boolean,
  formatLocale: string,
  groupBookingId?: string | null,
  invite?: GroupGuestInvite | null,
): Promise<void> {
  const { title, message, pushMessage } = buildGroupConfirmationCopy(
    name,
    booking,
    provider,
    isPrimary,
    formatLocale,
    invite,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';
  const tenantId = booking.tenant_id ?? null;
  const dedupeBase = invite
    ? `group_booking_invite:${userId}:${hashGroupInviteToken(invite.token).slice(0, 24)}`
    : `group_booking_confirmation:${userId}:${groupBookingId ?? booking.id}`;

  const notificationData = {
    booking_id: booking.id,
    booking_number: booking.booking_number ?? null,
    group_booking: true,
    group_booking_id: groupBookingId ?? null,
    ...(invite ? { group_invite_token: invite.token } : {}),
  };

  const actionUrl = invite
    ? `/group-invite/${encodeURIComponent(invite.token)}`
    : groupBookingId
      ? `/group-booking-detail?id=${groupBookingId}`
      : `/booking-detail?id=${booking.id}`;

  try {
    await insertNotification({
      user_id: userId,
      type: 'group_booking_confirmation',
      title,
      message: pushMessage,
      data: notificationData,
      action_url: actionUrl,
    });
  } catch (error) {
    console.warn('[group booking notifications] in-app insert failed:', error);
  }

  try {
    await sendToUser(
      userId,
      {
        title,
        message: pushMessage,
        type: 'group_booking_confirmation',
        data: notificationData,
        url: invite
          ? groupInviteUrl(invite.token)
          : groupBookingId
            ? `${appUrl}/account-settings/bookings?group_booking_id=${groupBookingId}`
            : `${appUrl}/account-settings/bookings`,
      },
      ['push'],
      { appType: 'customer' },
    );
  } catch (error) {
    console.warn('[group booking notifications] push failed:', error);
  }

  try {
    const inviteTemplateVars = invite
      ? {
          inviter_name: provider?.business_name?.trim() || 'Your host',
          provider_name: provider?.business_name?.trim() || 'Beautonomi Partner',
          invite_url: groupInviteUrl(invite.token),
          group_booking_id: groupBookingId ?? '',
          amount_due: invite.amountDue != null ? String(invite.amountDue) : '',
          currency: invite.currency ?? '',
        }
      : {};

    await enqueueMultiChannel(
      {
        templateKey: invite ? 'group_invite_guest' : 'group_booking_confirmation',
        recipientUserId: userId,
        bookingId: booking.id,
        tenantId,
        payload: {
          subject: title,
          html: messageToHtml(message),
          body: message,
          data: notificationData,
          ...inviteTemplateVars,
        },
      },
      ['email', 'sms'],
      dedupeBase,
    );
  } catch (error) {
    console.warn('[group booking notifications] durable email/SMS enqueue failed:', error);
  }
}
