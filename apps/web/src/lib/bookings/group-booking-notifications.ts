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
import { resolveTwilioCredentials, sendTwilioSMS } from '@/lib/integrations/twilio';
import { sendResendEmail } from '@/lib/integrations/resend';

type GroupNotificationParticipant = {
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  is_primary_contact: boolean;
  customer_id?: string | null;
};

export type SendGroupBookingNotificationsOptions = {
  /** When true, skip the primary contact (e.g. online checkout already sent booking_confirmed). */
  skipPrimaryContact?: boolean;
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
      .select('participant_name, participant_email, participant_phone, is_primary_contact, customer_id')
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

  const { data: provider } = await supabase
    .from('providers')
    .select('business_name, slug')
    .eq('id', booking.provider_id)
    .maybeSingle();

  for (const participant of participants) {
    if (options?.skipPrimaryContact && participant.is_primary_contact) {
      continue;
    }

    const userId = await resolveParticipantUserId(supabase, participant);
    const walkInChannels = {
      email: Boolean(participant.participant_email),
      sms: Boolean(participant.participant_phone),
    };

    if (userId) {
      await sendGroupBookingConfirmation(
        supabase,
        userId,
        participant.participant_name,
        booking,
        provider,
        participant.is_primary_contact,
        groupBookingId,
      );
      continue;
    }

    await sendWalkInGroupBookingConfirmation(
      supabase,
      participant,
      booking,
      provider,
      walkInChannels,
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
): { title: string; message: string; pushMessage: string } {
  const scheduledDate = new Date(booking.scheduled_at || Date.now());
  const dateStr = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';
  const bookingNumber = booking.booking_number || booking.id;

  const title = isPrimary
    ? `Group Booking Confirmation - ${bookingNumber}`
    : `You're Invited to a Group Booking - ${bookingNumber}`;

  const pushMessage = isPrimary
    ? `Your group booking ${bookingNumber} is confirmed for ${dateStr} at ${timeStr}.`
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
    : 'The primary contact will handle payment and coordination for this group booking.'
}

View your booking:
${appUrl}/account-settings/bookings

Best regards,
Beautonomi Team
  `.trim();

  return { title, message, pushMessage };
}

function messageToHtml(body: string): string {
  return `<p>${body.replace(/\n+/g, '</p><p>')}</p>`;
}

async function sendWalkInEmail(
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
): Promise<void> {
  const { title, message } = buildGroupConfirmationCopy(
    participant.participant_name,
    booking,
    provider,
    participant.is_primary_contact,
  );

  if (channels.email && participant.participant_email) {
    try {
      await sendWalkInEmail(supabase, participant.participant_email, title, message);
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
  groupBookingId?: string | null,
): Promise<void> {
  const { title, message, pushMessage } = buildGroupConfirmationCopy(
    name,
    booking,
    provider,
    isPrimary,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';
  const tenantId = booking.tenant_id ?? null;
  const dedupeBase = `group_booking_confirmation:${userId}:${groupBookingId ?? booking.id}`;

  const notificationData = {
    booking_id: booking.id,
    booking_number: booking.booking_number ?? null,
    group_booking: true,
    group_booking_id: groupBookingId ?? null,
  };

  const actionUrl = groupBookingId
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
        url: groupBookingId
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
    await enqueueMultiChannel(
      {
        templateKey: 'group_booking_confirmation',
        recipientUserId: userId,
        bookingId: booking.id,
        tenantId,
        payload: {
          subject: title,
          html: messageToHtml(message),
          body: message,
          data: notificationData,
        },
      },
      ['email', 'sms'],
      dedupeBase,
    );
  } catch (error) {
    console.warn('[group booking notifications] durable email/SMS enqueue failed:', error);
  }
}
